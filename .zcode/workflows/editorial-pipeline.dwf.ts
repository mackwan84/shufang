/* zcode-workflow
description: 模拟出版社编辑部「作者—责任编辑—文字编辑—复审校对—总编辑」分工的文档合并重写流水线：作者按合并依据起草并按初审意见改稿、初审全面审读出意见、文字编辑只做润色与格式校对、复核逐条核对并可退回修复（有界循环）、总编辑通读签发。修订依据由
  task 参数注入，最终交付签发判定与修订后文档。默认模型阵容为书坊项目定制：作者 Gemini-3.8-Flash、初审 Claude Fable
  5.1、文字编辑 Gemini-4-Argon、复核 GPT-6.1 Sol、总编辑 Kimi K3.1
  Pro；用于其他项目时需编辑脚本调整模型与角色透镜。
whenToUse: 已有一份评审/裁决结论（评审报告）需要合并进目标文档、并按编辑部分工重写可读性时使用。显式传入原稿（doc）、修订前快照（docBackup）、依据报告（sourceReport）、修订稿输出路径（outputDoc）和合并任务说明（task，含修订清单与已定决策），另可传项目名、交付标题与返工轮数。默认禁止覆盖原稿；仅当
  outputDoc 与 doc 相同且 allowOverwrite=true 时才允许覆盖。适合「评审后修订」场景；从零起草无依据报告的文档或纯代码任务不适用。由书坊方案编辑部流程运行（dwfrun-4e216b6a-cf24-4967-bd47-251595400efe）提炼而来。
args:
  doc:
    type: string
    description: 原稿路径，工作区相对路径；默认只读，除非 outputDoc 指向同一路径且显式允许覆盖
    required: false
    default: novel_harness_design.md
  docBackup:
    type: string
    description: 修订前原稿的独立快照路径，供初审与复核对照；调用前须确认内容与本轮修订前原稿一致
    required: true
  deliverableTitle:
    type: string
    description: 交付文档卡片的标题
    required: false
    default: 书坊方案修订稿（编辑部流程）
  maxReworkRounds:
    type: number
    description: 复核发现阻塞问题后退回文字编辑再修的最大复核轮数，须为 1~10 的整数，默认 2
    required: false
    default: 2
  outputDoc:
    type: string
    description: 修订稿写入路径；不得覆盖 sourceReport 或 docBackup，与 doc 相同时须设置 allowOverwrite=true
    required: true
  allowOverwrite:
    type: boolean
    description: 是否允许 outputDoc 与 doc 相同并覆盖原稿；覆盖前应已有 Git 提交或独立快照，默认 false
    required: false
    default: false
  projectName:
    type: string
    description: 项目名，用于作者与总编辑的身份表述
    required: false
    default: 书坊
  sourceReport:
    type: string
    description: 合并依据的评审/裁决报告路径（工作区相对）
    required: true
  task:
    type: string
    description: 本轮合并任务说明，包括修订依据清单、已定决策、可读性要求及版本或状态记录方式；不再提供历史任务默认值
    required: true
*/
/** 一条审校意见（初审/复核通用）。 */
interface ReviewNote {
  /** 位置：章节或决策编号。 */
  where: string;
  /** 问题：修订遗漏、表述走样、格式或可读性缺陷。 */
  problem: string;
  /** 修复建议。 */
  fix: string;
  /** high=必须修复（修订丢失/技术错误）；medium=明显问题；low=润色。 */
  severity: "low" | "medium" | "high";
}

/** 初审结果。 */
interface FirstReview {
  /** 总评 2~3 句。 */
  overall: string;
  /** 给作者的意见清单，按重要性降序排列。 */
  notes: ReviewNote[];
}

/** 复核结果。 */
interface Recheck {
  /** 总评。 */
  overall: string;
  /** 仍未解决的问题。 */
  issues: ReviewNote[];
  /** 是否存在未解决的 high 问题（true 则退回文字编辑再修）。 */
  blocking: boolean;
}

/** 终审签发。 */
interface Signoff {
  /** 是否签发（达到可交付水平）。 */
  pass: boolean;
  /** 总评 2~3 句。 */
  overall: string;
  /** 签发同时仍需方案作者知晓的事项。 */
  notes: string[];
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} 必须是非空字符串`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string, fallback: string): string {
  return value === undefined ? fallback : requiredString(value, name);
}

function workspacePath(value: unknown, name: string): string {
  const raw = requiredString(value, name);
  if (raw.includes("\0") || raw.startsWith("/") || raw.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new Error(`${name} 必须是工作区相对路径：${raw}`);
  }

  // 只保留工作区内的规范化相对路径，防止来源隔离校验被 ./、../ 绕过。
  const parts: string[] = [];
  for (const part of raw.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error(`${name} 不能越出工作区：${raw}`);
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  if (parts.length === 0) throw new Error(`${name} 必须指向文件`);
  return parts.join("/");
}

function reworkRounds(value: unknown): number {
  if (value === undefined) return 2;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("maxReworkRounds 必须是 1~10 的整数");
  }
  return value;
}

function validateDocumentPaths(
  doc: string,
  report: string,
  backup: string,
  output: string,
  allowOverwrite: boolean,
): void {
  if (new Set([doc, report, backup]).size !== 3) {
    throw new Error("doc、sourceReport、docBackup 必须是三个不同的文件");
  }
  if (output === report || output === backup) {
    throw new Error("outputDoc 不得覆盖 sourceReport 或 docBackup");
  }
  if (output === doc && !allowOverwrite) {
    throw new Error("outputDoc 与 doc 相同时必须显式设置 allowOverwrite=true");
  }
}

const DOC = args.doc === undefined ? "novel_harness_design.md" : workspacePath(args.doc, "doc");
const REPORT = workspacePath(args.sourceReport, "sourceReport");
const SOURCE_BACKUP = workspacePath(args.docBackup, "docBackup");
const OUTPUT_DOC = workspacePath(args.outputDoc, "outputDoc");
const TASK = requiredString(args.task, "task");
const PROJECT_NAME = optionalString(args.projectName, "projectName", "书坊");
const DELIVERABLE_TITLE = optionalString(args.deliverableTitle, "deliverableTitle", "书坊方案修订稿（编辑部流程）");
const MAX_REWORK_ROUNDS = reworkRounds(args.maxReworkRounds);

if (args.allowOverwrite !== undefined && typeof args.allowOverwrite !== "boolean") {
  throw new Error("allowOverwrite 必须是布尔值");
}
const ALLOW_OVERWRITE = args.allowOverwrite === true;
validateDocumentPaths(DOC, REPORT, SOURCE_BACKUP, OUTPUT_DOC, ALLOW_OVERWRITE);

phase("作者按修订依据起草");
const author = agent("作者", {
  model: "new-provider/gemini-3.8-flash",
  system:
    `你是「${PROJECT_NAME}」方案的作者：按评审结论起草并修订自己的方案文稿。快速产出结构完整、内容齐全的稿子，` +
    "所有修订内容必须落实到位，不许省略或跳过任何一节；不新增自己的裁决观点；材料之间有冲突时，以评审报告的最终裁决为准。" +
    "全部用中文。如果任务材料缺失或指令自相矛盾，直说并要求澄清，而不是硬写。",
});
await author.ask(
  `请用文件工具读取原稿 ${DOC} 和评审报告 ${REPORT}，然后按下面的任务说明写出修订稿，` +
    `将完整 Markdown 写入 ${OUTPUT_DOC}，保持标题层级、表格与 mermaid 图的结构习惯。除该输出文件外不要修改任何文件：\n\n${TASK}\n\n` +
    "保留文档性质与状态说明，并按任务要求记录变更来源；不要自行虚构正式版本号。写完后回复一段简短的变更摘要。",
);

phase("责任编辑全面审读修订稿");
const firstEditor = agent("初审编辑", {
  model: "new-provider/copilot/claude-fable-5.1",
  system:
    "你是方案的责任编辑，负责初审：没有参与起草，只对「修订是否忠实落实、技术表述是否在重写中走样、" +
    "可读性是否真的改善」负责。挑毛病优先于夸奖，每条意见给出具体位置和修复建议，意见是给作者改稿用的。" +
    "全部用中文。如果任务材料缺失或自相矛盾，直说而不是硬审。",
});
const first = await firstEditor.ask<FirstReview>(
  `请用文件工具读取三份材料：评审报告 ${REPORT}、修订前快照 ${SOURCE_BACKUP}、修订稿 ${OUTPUT_DOC}。逐项核对：\n` +
    "1. 报告「修订后的决策表」的每条决策在修订稿中是否落实（逐条点名，缺失的明确指出）；\n" +
    "2. 可读性重写有没有把原稿或报告中的关键技术表述改丢或改错（字段定义、协议规则、量化标准）；\n" +
    `3. 本轮任务说明中的已定决策是否正确写入：${TASK}\n` +
    "4. 评审报告遗留问题中已有建议的是否按建议落实；\n" +
    "5. 可读性：挑出修订稿中仍然生涩难懂的段落（如有）。\n" +
    "输出总评与给作者的意见清单。只做审读，不要修改文件。",
);
report({ 初审意见: first });

phase("作者按初审意见改稿");
await author.ask(
  `责任编辑的初审意见如下，请逐条修订（不认同的条目说明理由），只更新 ${OUTPUT_DOC}，回复修订摘要：\n${JSON.stringify(first)}`,
);

phase("文字编辑润色并校对格式");
const copyEditor = agent("文字编辑", {
  model: "new-provider/gemini-4-argon",
  system:
    "你是方案的文字编辑，负责编辑加工：只做规范性修改与文字润色——术语统一、生涩段落打磨、句子理顺、" +
    "格式与编号与 mermaid 图完整性检查修正。技术决策内容、字段定义、量化标准一律不动；" +
    "发现疑似技术问题不要自己改，记录下来交给复核。文字功底要配得上最终交付。全部用中文。",
});
await copyEditor.ask(
  `请对 ${OUTPUT_DOC} 全文做编辑加工：通读、润色仍生涩的段落、统一术语与标点、检查标题层级、编号完整与 mermaid 语法；` +
    `技术内容一律不动。只更新 ${OUTPUT_DOC}，回复加工摘要与记录到的疑似技术问题（如有）。`,
);

phase("复核修订落实与加工质量");
const recheckEditor = agent("复审编辑", {
  model: "new-provider/gpt-6.1-sol",
  system:
    "你是方案的复审编辑兼校对：核对初审意见是否被作者真正落实、文字编辑的加工有没有改坏东西、" +
    "以及全稿规范性（结构完整、编号齐全、无自相矛盾）。逐条核对、以文档原文为证，宁可误报不可漏报，" +
    "每条给出位置与证据。全部用中文。如果材料不足以下结论，如实标注。只做复核，不要修改文件。",
});
let recheck: Recheck = { overall: "", issues: [], blocking: false };
for (let round = 1; round <= MAX_REWORK_ROUNDS; round += 1) {
  recheck = await recheckEditor.ask<Recheck>(
    round === 1
      ? `请用文件工具读取 ${REPORT}（评审报告）、${SOURCE_BACKUP}（修订前快照）和 ${OUTPUT_DOC}（当前修订稿）。初审意见：${JSON.stringify(first)}\n复核：\n` +
          "1. 修订决策是否全部落实且未被后续加工损坏；\n" +
          "2. 初审意见是否已逐条处理；\n" +
          "3. 全稿规范性：结构、编号、mermaid、术语一致性；\n" +
          "4. 仍存在的 high 级问题（修订丢失/技术错误）→ blocking=true。"
      : `文字编辑已按你的复核意见修复退回的 high 问题，请对 ${OUTPUT_DOC} 再复核一轮，重点验证上轮 high 问题是否真正解决、有无新引入的问题。只做复核，不要修改文件。`,
  );
  const blockingNotes = recheck.issues.filter((note) => note.severity === "high");
  recheck.blocking = recheck.blocking || blockingNotes.length > 0;
  report({ 复核: recheck, 轮次: round });
  if (!recheck.blocking) break;
  if (round === MAX_REWORK_ROUNDS || blockingNotes.length === 0) break;
  phase("文字编辑修复复核阻塞问题");
  await copyEditor.ask(
    `复核退回以下必须修复的问题，请只针对这些修复（不改其他内容），直接更新 ${OUTPUT_DOC}，回复修复说明：\n` +
      JSON.stringify(blockingNotes),
  );
}

phase("总编辑通读并给出签发判定");
const chiefEditor = agent("总编辑", {
  model: "moonshot-kimi/k3.1-pro",
  system:
    `你是「${PROJECT_NAME}」项目的总编辑：中文网文行业的资深主编，负责终审签发。以读者视角通读全稿，判断整体连贯、` +
    "可读性是否达到交付水平、有无重大遗漏或硬伤；不纠结细枝末节（初审复审已管），只拦真正的问题。" +
    "给出明确的签发判定。全部用中文。只做终审，不要修改文件。",
});
const hasBlockingIssue = recheck.blocking || recheck.issues.some((note) => note.severity === "high");
const signoff = await chiefEditor.ask<Signoff>(
  `本轮任务说明：${TASK}\n` +
    `请用文件工具读取修订稿 ${OUTPUT_DOC} 与评审报告 ${REPORT}，以总编辑身份通读：\n` +
    "1. 整体是否连贯、作为方案文档是否好读（对照本轮任务说明中的可读性目标）；\n" +
    "2. 有无重大遗漏或硬伤（对照报告的修订决策方向抽查，不逐条）；\n" +
    `3. 最后一轮复核结果如下；若 blocking=true 或仍有 high 问题，你必须 pass=false：${JSON.stringify(recheck)}\n` +
    "4. 输出签发判定（pass）与需要方案作者知晓的事项。",
);
report({ 终审签发: signoff });

const deliveryPassed = signoff.pass && !hasBlockingIssue;
report({ 交付判定: deliveryPassed, 修订稿: OUTPUT_DOC, 复核阻塞: hasBlockingIssue, 总编辑签发: signoff.pass });
await artifact.file("revised-document", OUTPUT_DOC, {
  title: DELIVERABLE_TITLE,
  description: deliveryPassed
    ? "修订稿已通过总编辑签发，且最后一轮复核无阻塞问题。"
    : "修订稿尚未满足交付条件；保留为检查用产物，请处理复核阻塞或终审未签发原因。",
  primary: deliveryPassed,
});

return {
  conclusion: `${signoff.overall}（交付判定：${deliveryPassed ? "通过" : "未通过"}；总编辑${signoff.pass ? "签发" : "未签发"}；复核${hasBlockingIssue ? "仍有阻塞问题" : "无阻塞问题"}。）`,
  findings: [
    ...recheck.issues.map((n) => ({
      where: "复核未决",
      what: n.problem,
      evidence: `${n.where}；建议：${n.fix}`,
      status: "unconfirmed" as const,
      severity: n.severity,
    })),
    ...signoff.notes.map((n) => ({
      where: "终审意见",
      what: n,
      evidence: "总编辑签发时提请作者知晓",
      status: "unconfirmed" as const,
      severity: "low" as const,
    })),
  ],
  verified: [
    "调用模型前已完成参数类型、工作区相对路径、来源文件隔离、原稿覆盖授权与返工轮次校验",
    "初审、复审与总编辑分别使用独立 agent；最终交付判定同时检查总编辑签发和复核阻塞/high 问题",
    "修订稿、复核意见与终审意见均已保留，未通过交付判定的文件不会标记为主产物",
  ],
  notCovered: [
    "未用确定性 diff 证明文字编辑没有改变技术内容；目前依赖提示约束与模型复核",
    "模型审读不能替代实际链接检查、Mermaid 渲染或应用测试，运行后仍须检查文件差异并执行相应验证",
  ],
};

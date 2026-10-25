/* zcode-workflow
description: 六位跨厂家模型评审团 + 主持人 + 独立终审 + 执笔人的多角色方案评审流水线：独立评审（相互隔离防锚定）→ 交叉互评互相反驳 →
  主持人逐条裁决并产出修订决策表 → 独立终审复核 → 主持人吸收终审定谳 → 执笔人成稿交付 markdown 评审报告。默认评审团角色透镜为中文小说创作
  agent harness（书坊项目）定制：架构评审（Claude Opus 5.5 $high）、网文编辑（Kimi K3.1
  Pro）、模型技术（GPT-6 Astra）、产品运营（Gemini-4-Argon）、合规风险（GPT-6.1 Sol）、魔鬼代言人（Claude
  Fable 5.1）；主持人用会话模型，独立终审 Opus 5.5 $high，执笔人 Gemini-4-Argon。评审团阵容、透镜与模型写死在脚本
  REVIEWERS 中，用于其他领域方案时需编辑脚本调整。
whenToUse: 需要对一份设计/方案文档做多模型、多角色的小组评审——各自独立挑漏洞、相互反驳、最终收敛出修订决策——时使用。传入待评审文档路径（doc）、评审时须注入的最高优先级定位/背景说明（positioning）、项目名（projectName）、报告标题（reportTitle）。适合方案设计阶段的"动工前对齐"场景；不用于代码评审（那类走逐文件
  review sweep 更合适）。由书坊方案评审运行（dwfrun-35f2f215-bfdf-47d1-a3ae-c4f511a64d11）提炼而来。
args:
  doc:
    type: string
    description: 待评审的方案文档，工作区相对路径
    required: false
    default: novel_harness_design.md
  positioning:
    type: string
    description: 注入每位评审与主持人的最高优先级定位/背景修正说明（例如晚于文档写成的项目定位变化、评审侧重点），优先级高于文档表述；默认值为书坊项目的定位修正
    required: false
    default: 【用户定位修正（2026-10-24，晚于文档写成，优先级高于文档表述）】成人/亲密向内容只是作者个人兴趣涉及的题材之一，并非项目主体；项目主体定位是：面向广大读者、可公开发布的各类题材中文小说创作。请重点检验
      D1「模型选型以成人内容为硬约束」、正文层只用开源模型、本地优先部署等决策在修正后的定位下是否仍然成立，是过度设计还是设计不足。
  projectName:
    type: string
    description: 项目名，用于评审团的身份表述（「你是「XX」方案评审团的成员」）
    required: false
    default: 书坊（中文小说创作 agent harness）
  reportTitle:
    type: string
    description: 最终评审报告的标题（报告首行与交付卡片标题）
    required: false
    default: 书坊方案评审报告
*/
/** 单条评审意见。 */
interface ReviewIssue {
  /** 一句话标题：问题或建议是什么。 */
  title: string;
  /** 详细说明：为什么是问题、影响什么、建议怎么改。 */
  detail: string;
  /** 重要性：high=动摇方案成立性；medium=显著影响质量或可行性；low=改进项。 */
  severity: "low" | "medium" | "high";
}

/** 一位评审第一轮独立评审的结果。 */
interface RoleReview {
  /** 对方案的总体评价，2~3 句。 */
  overall: string;
  /** 发现的问题与建议，按重要性降序排列。 */
  issues: ReviewIssue[];
}

/** 一条对其他评审意见的回应。 */
interface Rebuttal {
  /** 针对哪位评审（角色名）的哪条意见。 */
  target: string;
  /** true=认同并补充论据；false=反对并给出反驳。 */
  agree: boolean;
  /** 认同的补充论据，或反驳的论证。 */
  point: string;
}

/** 第二轮交叉互评的结果。 */
interface CrossOpinion {
  /** 对其他评审意见的逐条回应与反驳。 */
  rebuttals: Rebuttal[];
  /** 你认为所有评审集体遗漏的问题。 */
  missed: ReviewIssue[];
}

/** 主持人对一条意见的裁决。 */
interface Verdict {
  /** 争议点或意见标题。 */
  issue: string;
  /** 裁决与理由：采纳谁的意见（或都不采纳）、方案相应怎么改。 */
  ruling: string;
  /** 处置：adopted=采纳进修订方案；rejected=否决；deferred=存疑留给方案作者决定。 */
  disposition: "adopted" | "rejected" | "deferred";
}

/** 修订后的一条决策。 */
interface RevisedDecision {
  /** 决策编号，如 D1。 */
  id: string;
  /** 修订后的结论；维持原样写「保留原决策」。 */
  decision: string;
  /** 修改或保留的理由。 */
  reason: string;
}

/** 主持人收敛结果。 */
interface Synthesis {
  /** 3~5 句：这场讨论最重要的结论。 */
  summary: string;
  /** 对各方意见的逐条裁决。 */
  verdicts: Verdict[];
  /** 修订后的决策表。 */
  revisedDecisions: RevisedDecision[];
}

/** 独立终审结果。 */
interface FinalAudit {
  /** 修订后的方案是否可以定稿。 */
  pass: boolean;
  /** 定稿前仍需处理的问题；没有则为空数组。 */
  remaining: ReviewIssue[];
}

/** 报告条目。 */
interface Finding {
  /** 归属：待作者决策 / 终审遗留。 */
  where: string;
  /** 一句话：问题是什么。 */
  what: string;
  /** 依据：裁决理由或终审说明。 */
  evidence: string;
  /** verified=经交叉互评与主持人裁决；unconfirmed=终审提出、未再复核。 */
  status: "verified" | "unconfirmed";
  /** 重要性。 */
  severity: "low" | "medium" | "high";
}

/** 待评审的方案文档（工作区相对路径），来自运行参数。 */
const DOC = typeof args.doc === "string" && args.doc ? args.doc : "novel_harness_design.md";

/** 项目名（用于评审团身份表述），来自运行参数。 */
const PROJECT_NAME =
  typeof args.projectName === "string" && args.projectName ? args.projectName : "书坊（中文小说创作 agent harness）";

/** 注入每位评审的最高优先级定位/背景修正，优先级高于文档表述；来自运行参数。 */
const POSITIONING =
  typeof args.positioning === "string" && args.positioning
    ? args.positioning
    : "【用户定位修正（2026-10-24，晚于文档写成，优先级高于文档表述）】" +
      "成人/亲密向内容只是作者个人兴趣涉及的题材之一，并非项目主体；" +
      "项目主体定位是：面向广大读者、可公开发布的各类题材中文小说创作。" +
      "请重点检验 D1「模型选型以成人内容为硬约束」、正文层只用开源模型、本地优先部署等决策" +
      "在修正后的定位下是否仍然成立，是过度设计还是设计不足。";

/** 最终评审报告的标题，来自运行参数。 */
const REPORT_TITLE =
  typeof args.reportTitle === "string" && args.reportTitle ? args.reportTitle : "书坊方案评审报告";

const DISCIPLINE =
  "评审纪律：挑毛病优先于夸奖；每条意见必须给出理由和具体可执行的修改建议；" +
  "区分事实判断与口味判断；引用方案原文时注明所在章节；全部用中文。" +
  "如果任务指令自相矛盾或材料缺失，直接指出并要求澄清，而不是硬答。";

const REVIEWERS = ([
  {
    key: "架构评审",
    model: "new-provider/copilot/claude-opus-5.5$high",
    lens:
      "多 agent 系统架构师。重点审视：5.1 的角色拆分四原则是否被编制本身违反；主编只读结构化状态、" +
      "资料员作正文层唯一通道的脆弱性与单点故障；pi durable 底座的适配度；场景卡协议的可扩展性与防泄漏机制；" +
      "故事圣经、分层摘要、向量索引三种长程状态的一致性风险；生产流水线中某个角色失败或超时时的行为。",
  },
  {
    key: "网文编辑",
    model: "moonshot-kimi/k3.1-pro",
    lens:
      "中文网文资深主编。重点审视：编辑部/编剧室隐喻与真实网文生产流程的差距；场景卡字段（欲望、顾忌、信息差、" +
      "潜台词、不可言说）是否真能防住「角色念大纲」；第 2 节四类 AI 腔诊断是否准确、对症；" +
      "「两两对比选优 + 禁止整段重写的句子级修补」能否产出读者愿意付费追更的文字；MVP 选 3~5 万字中篇是否合理；" +
      "在可发布题材为主的新定位下，质量标准和读者接受度应该怎么定。",
  },
  {
    key: "模型技术",
    model: "new-provider/gpt-6-astra",
    lens:
      "LLM 工程与研究专家。重点审视：D1 模型选型策略与新定位的匹配；第 0 步模型摸底的方法论（5 张场景卡、" +
      "4~6 个模型、盲读打分的样本量与统计效力是否足够下结论）；正文层只用开源模型的技术依据在新定位下是否还成立；" +
      "范文锚点检索（RAG）对文笔的真实影响边界；偏好库远期训练 LoRA/DPO 的数据量与成本现实性；" +
      "编剧室多厂家模型提案的实际增益。",
  },
  {
    key: "产品运营",
    model: "new-provider/gemini-4-argon",
    lens:
      "产品经理与开源社区运营者。重点审视：路线图第 0 步 → MVP → 盲读验收 → 专家市场的节奏与门槛；" +
      "盲读 A/B 胜率 ≥ 70% 这个验收标准的合理性（谁来盲读、多少样本才算数）；monorepo + 专家索引仓的 GitHub 结构；" +
      "目标用户到底是谁（作者本人 vs 社区）——自用工具与开源平台两种定位对方案的拉扯；" +
      "新定位（可发布题材为主）对传播、获客、潜在商业化的影响。",
  },
  {
    key: "合规风险",
    model: "new-provider/gpt-6.1-sol",
    lens:
      "内容合规与法律风险顾问。重点审视：定位修正后整体合规策略的重心变化——可发布题材为主时，" +
      "哪些原来为成人内容设的约束可以放宽、哪些反而新增了合规义务（国内平台发布规则、AI 生成内容标识义务）；" +
      "成人向作为「个人爱好题材」与开源项目声誉、GitHub 托管政策的张力；" +
      "范文语料「只在本地使用」的版权边界；专家包分发内容与提示词的版权归属；各家模型 API 条款对小说创作的限制。",
  },
  {
    key: "魔鬼代言人",
    model: "new-provider/copilot/claude-fable-5.1",
    lens:
      "专职挑刺者，任务就是论证这个方案为什么可能失败。重点找：D1~D13 决策之间的内部矛盾；" +
      "过度设计（远期专家市场、LoRA 训练是否空中楼阁）与设计不足（偏好库冷启动、审读也是模型写的，" +
      "「自动审自动」闭环的可信度）；被美化的假设（盲读 A/B 的盲读裁判是谁？胜率 70% 相对什么基线？）；" +
      "最根本的失败模式——自建 harness 最终又回到「产出质量完全取决于模型」的原点，整个项目的差异化到底在哪。",
  },
]) as const;

const critics = REVIEWERS.map((r) =>
  agent(`评审·${r.key}`, {
    model: r.model,
    system: `你是「${PROJECT_NAME}」方案评审团的成员。角色透镜：${r.lens}\n${DISCIPLINE}`,
  }),
);

phase("六位评审独立通读方案并提意见");
log(`评审团就位：${REVIEWERS.map((r) => `${r.key}（${r.model}）`).join("、")}`);
const reviews = await Promise.all(
  critics.map(async (c, i) => {
    const review = await c.ask<RoleReview>(
      `用文件工具读取 ${DOC} 全文，独立完成第一轮评审，不要参考任何其他人的观点。\n\n${POSITIONING}\n\n` +
        `从你的角色透镜找出方案的漏洞、风险与优化建议，输出总评和意见列表。`,
    );
    report({ 评审: REVIEWERS[i].key, 模型: REVIEWERS[i].model, 总评: review.overall, 意见: review.issues });
    return review;
  }),
);

phase("交叉互评：互相反驳、揪出彼此意见的漏洞");
const cross = await Promise.all(
  critics.map(async (c, i) => {
    const others = REVIEWERS.map((r, j) => ({ 评审: r.key, ...reviews[j] })).filter((_, j) => j !== i);
    const opinion = await c.ask<CrossOpinion>(
      `第一轮评审结束。以下是其他五位评审的意见（含角色名）：\n${JSON.stringify(others)}\n\n` +
        `请逐条审视：认同的补充论据；反对的给出反驳——特别要揪出其他评审建议本身的漏洞（不可行、成本错判、会引入新问题）；` +
        `最后指出你认为所有人集体遗漏的问题。`,
    );
    report({ 评审: REVIEWERS[i].key, 交叉互评: opinion });
    return opinion;
  }),
);

phase("主持人逐条裁决，产出修订决策表");
const moderator = agent("主持人", {
  system:
    "你是本场方案评审的主持人：资深技术方案评审专家，负责逐条裁决评审团意见并收敛出修订方案。" +
    "裁决标准：以任务材料中的用户定位/背景修正为准绳，以证据和逻辑取舍，不和稀泥、" +
    "不各打五十大板；确实两难且取决于作者偏好的，标记存疑留给作者，不替作者拍板。全部用中文。" +
    "如果材料不足以裁决某条意见，如实标注而不是硬裁。",
});
const synthesis = await moderator.ask<Synthesis>(
  `请先用文件工具读取方案原文 ${DOC}。本场材料：\n\n${POSITIONING}\n\n` +
    `六位评审的独立意见：\n${JSON.stringify(REVIEWERS.map((r, i) => ({ 评审: r.key, ...reviews[i] })))}\n\n` +
    `交叉互评记录：\n${JSON.stringify(REVIEWERS.map((r, i) => ({ 评审: r.key, ...cross[i] })))}\n\n` +
    `请输出：1) summary（这场讨论最重要的结论）；2) verdicts：对每条 high/medium 意见逐条裁决，` +
    `明确处置（采纳/否决/存疑留给作者）并给出理由；3) revisedDecisions：逐条决策（如 D1~D13）给出修订后的结论与理由，` +
    `维持原样的写「保留原决策」。`,
);
report({ 主持人裁决: synthesis });

phase("独立终审：新鲜眼光复核收敛稿");
const auditor = agent("独立终审", {
  model: "new-provider/copilot/claude-opus-5.5$high",
  system:
    "你是独立终审人：没有参与过之前任何讨论的最终把关者，只对修订后方案的正确性与完整性负责，" +
    "不照顾任何评审和主持人的面子。全部用中文。",
});
const audit = await auditor.ask<FinalAudit>(
  `用文件工具读取方案原文 ${DOC}，然后审读主持人产出的裁决与修订决策表：\n${JSON.stringify(synthesis)}\n\n${POSITIONING}\n\n` +
    `你是最后一道关：修订后的方案还有哪些漏洞？哪些裁决理由站不住脚？哪些矛盾被裁决掩盖了？` +
    `没有阻断性问题时 pass=true、remaining 为空数组。`,
);
report({ 独立终审: audit });

phase("主持人吸收终审意见，敲定最终裁决");
const finalSynthesis = await moderator.ask<Synthesis>(
  `独立终审意见：\n${JSON.stringify(audit)}\n\n` +
    `请吸收其中成立的部分，可以改判之前的裁决（在裁决理由中注明改判及原因），` +
    `然后返回更新后的完整裁决结果（summary / verdicts / revisedDecisions，与第一轮格式相同）。`,
);

phase("执笔人撰写最终评审报告");
const scribe = agent("执笔人", {
  model: "new-provider/copilot/gemini-4-argon",
  system:
    "你是本场评审的执笔人：中文技术写作专家，文字功底扎实，负责把整场讨论写成一份清晰、有说服力、" +
    "方案作者能直接照着改的评审报告。你的职责是忠实呈现讨论与裁决，不新增自己的裁决观点；" +
    "材料之间有冲突时，以主持人最终裁决为准。全部用中文。",
});
const finalReport = await scribe.ask<string>(
  `请先用文件工具读取方案原文 ${DOC}。本场材料：\n\n${POSITIONING}\n\n` +
    `六位评审的独立意见：\n${JSON.stringify(REVIEWERS.map((r, i) => ({ 评审: r.key, ...reviews[i] })))}\n\n` +
    `交叉互评记录：\n${JSON.stringify(REVIEWERS.map((r, i) => ({ 评审: r.key, ...cross[i] })))}\n\n` +
    `独立终审意见：\n${JSON.stringify(audit)}\n\n` +
    `主持人最终裁决（报告以此为准）：\n${JSON.stringify(finalSynthesis)}\n\n` +
    `请输出最终评审报告的完整 markdown，结构：\n` +
    `# ${REPORT_TITLE}\n## 一、讨论过程摘要（评审团构成、主要交锋点）\n## 二、逐条裁决表（意见 → 处置 → 理由）\n` +
    `## 三、修订后的决策表\n## 四、仍存疑、留给方案作者决定的事项\n## 五、下一步建议\n` +
    `直接返回 markdown 全文，不要用代码块包裹。`,
);
await artifact.markdown("report", finalReport, {
  title: REPORT_TITLE,
  description: "六个模型角色两轮讨论 + 主持人裁决 + 独立终审 + Gemini 执笔的方案评审与修订结论。",
  primary: true,
});

const findings: Finding[] = [
  ...finalSynthesis.verdicts
    .filter((v) => v.disposition === "deferred")
    .map((v) => ({
      where: "待作者决策",
      what: v.issue,
      evidence: v.ruling,
      status: "verified" as const,
      severity: "medium" as const,
    })),
  ...audit.remaining.map((r) => ({
    where: "终审遗留",
    what: r.title,
    evidence: r.detail,
    status: "unconfirmed" as const,
    severity: r.severity,
  })),
];

return {
  conclusion: `${finalSynthesis.summary}（独立终审${audit.pass ? "通过" : `提出 ${audit.remaining.length} 条遗留问题`}。）`,
  findings,
  verified: [
    "六个评审角色分别使用独立 agent 完成第一轮评审与交叉互评；第一轮未注入其他角色的意见",
    "主持人收到对 high/medium 意见逐条裁决的明确指令，并输出处置与理由",
    "独立终审与执笔人均使用独立 agent；终审意见交由主持人复核后才形成最终裁决",
    "最终报告由未参与裁决的执笔人根据主持人最终裁决撰写",
  ],
  notCovered: [
    "low 意见不保证全部进入主持人的逐条裁决表",
    "脚本未确定性验证模型是否实际完整读取文件，也未独立复核报告中的每项引用与事实断言",
    "纯方案评审：未做任何代码或运行验证",
    "pi durable / pi-ai 的能力以方案文档自述为准，未实测",
    "盲读 A/B 等验收指标的可行性未实证",
  ],
};

# 文档辅助工作流

这里保存两套已有的 ZCode 工作流，服务于方案讨论和文档修订。它们不是书坊小说创作引擎的实现。

## 工作流一览

| 工作流 | 用途 | 主要输入 |
| --- | --- | --- |
| [panel-review.dwf.ts](panel-review.dwf.ts) | 独立评审、交叉互评、主持人裁决、终审与报告整理 | `doc`、`positioning`、`projectName`、`reportTitle` |
| [editorial-pipeline.dwf.ts](editorial-pipeline.dwf.ts) | 按既有评审依据修订文档，经过初审、文字编辑、复核与签发 | `doc`、`docBackup`、`sourceReport`、`outputDoc`、`task`、`allowOverwrite`、`projectName`、`deliverableTitle`、`maxReworkRounds` |

参数类型和默认值见各脚本顶部的 `zcode-workflow` 声明；工作区相对路径以项目根目录为基准。

## 使用前确认

1. 使用支持 `.dwf.ts` 的 ZCode 工作流运行环境。脚本使用宿主提供的 `agent`、`args` 等能力，仓库没有独立 Node.js 启动入口。
2. 检查脚本中的模型配置。模型名称与角色分工来自编写时的环境，需要自行配置可用的模型接入；仓库不包含凭证，也未验证其在其他环境中的可用性。
3. 显式填写本次任务的文档路径、背景和修订要求。评审流的 `positioning` 默认值保留了早期题材定位修正，使用前应确认仍适用于本轮；编辑流的 `task`、评审依据、修订前快照和输出路径均为必填，不再内置历史合并任务。
4. 编辑流要求 `doc`、`sourceReport`、`docBackup` 指向三个不同文件，`outputDoc` 不得覆盖报告或快照。默认应将修订稿写入独立的 `outputDoc`；仅当输出与原稿相同且显式设置 `allowOverwrite=true` 时才允许覆盖原稿。
5. 覆盖原稿前保存目标文档的 Git 提交或独立快照，并确认 `docBackup` 与本轮修订前内容一致。独立输出时也应选择不存在或明确属于本轮产物的路径，避免覆盖其他文件。
6. 运行完成后检查实际文件差异、引用路径和遗留问题。最终交付通过须同时满足“总编辑签发”和“最后一轮复核无阻塞及 high 问题”；未通过时文件仅作为检查产物保留，不标记为主产物。“签发”仍只属于文档评审，不等于正式方案定版或应用验收。

## 本地文件边界

- `.zcode/workflows/`：纳入版本控制的工作流源文件与说明。
- `.zcode/workflow-drafts/`：本地工作流草稿，默认忽略。
- `.zcode/workflow-runs/`：本地运行生成文件，默认忽略。

需要保留的评审结论应整理为 `docs/` 中可阅读、可追溯的记录，并加入[文档索引](../../docs/README.md)。仓库文档整理与静态检查不要求执行这些工作流。

# AGENTS.md

## Git 提交规范

### 约定式提交(Conventional Commits)

所有 Git 提交信息必须符合 [约定式提交规范](https://www.conventionalcommits.org/zh-hans/v1.0.0/),格式如下:

```text
<type>[optional scope]: <中文描述>

[required body]

[optional footer(s)]
```

### BREAKING CHANGE

在脚注中包含 BREAKING CHANGE: 或 <类型>(范围) 后面有一个 ! 的提交，表示引入了破坏性 API 变更（这和语义化版本中的 MAJOR 相对应）。 破坏性变更可以是任意 类型 提交的一部分

### Type 类型

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档变更
- `style`: 代码格式(不影响功能)
- `refactor`: 代码重构
- `perf`: 性能优化
- `test`: 测试相关
- `build`: 构建系统/外部依赖
- `ci`: CI 配置变更
- `chore`: 其他不修改源码的变更
- `revert`: 回退提交

## 文档治理

- 项目处于早期设计与讨论阶段，尚无小说创作应用实现。描述能力时区分“现有内容”“拟议方案”和“验证结果”。
- 修改产品方向、架构或协议前，先阅读 [当前设计草案](novel_harness_design.md) 的相关章节；涉及架构调整、数据迁移或核心逻辑变更，先提案确认再执行。
- 当前方案统一维护在 `novel_harness_design.md`，使用“设计草案”表述；历史 `v1`、`v2` 等标记只用于追溯内部修订，不代表正式定版或软件版本。
- 追溯旧决策或评审意见时，先查 [文档索引](docs/README.md)。历史快照与评审正文保留原貌，更正另行记录；历史行号按其当轮文稿解释。
- 新增评审、实验记录使用描述性名称与日期，并注明对象、范围、证据及待确认事项。日常修订通过 Git 追踪，无需逐次复制全文备份。
- 新增或移动文档时更新索引与相对链接；提交前检查链接、文档状态描述和实际文件差异。
- 执行文档辅助工作流前，阅读 [工作流说明](.zcode/workflows/README.md)，确认本轮参数和修订前快照，避免沿用历史默认任务。

## 项目结构

- `README.md`：项目简介、当前状态与阅读入口。
- `novel_harness_design.md`：当前设计草案。
- `docs/`：文档索引、历史草案快照与评审记录。
- `.zcode/workflows/`：纳入版本控制的文档辅助工作流。
- `.zcode/workflow-drafts/`、`.zcode/workflow-runs/`、`.v2c/`、`.video_agent/`：本地草稿、运行产物或插件配置，由 `.gitignore` 排除。
- `packages/`、`experts/` 等仅存在于草案中的目录属于拟议结构，待实施时再建立。

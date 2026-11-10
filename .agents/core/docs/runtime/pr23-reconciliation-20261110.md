# PR23 与当前主线的差异对账

对照基线：`core-main` 的 `66adf356c07c9b0eefbce5302b7cc8cd72ced396`；原 PR23：`cd3e8959f25562f1e6fbaf33d4e522b62fef173a`；共同祖先：`a4c0d4f19149a1a12dfce661edecc648fb78339e`。

213 个原路径：105 项状态与主线相同（含双方删除），69 项双方修改，37 项仅 PR 修改，2 项已由主线删除。SDK、双渠道应用升级和领域治理等业务实现采用当前主线；保留独立测试重构。

## 保留范围

- shared/native 验证分层，通用一次、原生按平台验证；冻结精确选测计划和完整发行证明。
- 按执行 AST 与断言审计旧覆盖；保留主线新增测试。
- 每轮复用不可变发行种子，独立复制场景目录与 Git 历史；保留进程恢复与 Windows/Linux 原生边界。
- 保留当前主线 Core 0.5.4、Projects 0.10.107、工作上下文和项目治理。

## 覆盖对账

旧账目的 1399 个场景：1364 个保留（1343 个执行 AST 不变、11 个保留原断言的增补、10 个逐断言登记的契约更新），5 个 CI 策略替换，30 个由 PR24 已退役的 project-intake 接口场景。原 hash 保留，不整套重录。
退役场景明确列出上游提交、已删除实现路径和固定原生测试 guard；实现重新出现、guard 丢失/改变或缺少原生平台时审计失败。该 30 项不计作保留覆盖；原生旧账目为580项保留及30项明确退役。
另为主线未被旧账目覆盖的276个场景追加主线快照约束。两份历史可以约束同一增补场景的不同断言，不要求为此重复执行测试。
整合清单为236个文件，143个shared、91个Windows native；另保留Linux专属测试。新增主线18个文件均有明确验证层和选测输入。

## 逐路径处理

| 原路径 | 原差异 | 处理结果 |
| --- | --- | --- |
| `.agents/core/abilities/competencies/ability-maintenance/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/ability-route/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/archive-maintenance/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/asset-maintenance/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/capability-validation/competency.md` | 主线已删除 | 保留主线删除决定 |
| `.agents/core/abilities/competencies/competency-design/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/cooperation-design/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/improvement-delivery/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/inbox-triage/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/knowledge-organize/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/orphan-competency-match/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/partner-design/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/persona-maintenance/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/project-acceptance/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/project-control/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/project-intake/competency.md` | 主线已删除 | 保留主线删除决定 |
| `.agents/core/abilities/competencies/project-planning/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/project-route/competency.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/competencies/source-management/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/system-contribute/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/system-release/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/system-update/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/work-review/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/competencies/workspace-create/competency.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/partners/ability-manager/partner.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/ability-manager/references/object-core.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/ability-manager/references/user-data-design.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/ability-manager/templates/object-user-data.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/archive-manager/partner.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/partners/competency-router/partner.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/improvement-guide/partner.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/partners/inbox-manager/partner.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/partners/knowledge-manager/partner.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/partners/ksf-maintainer/partner.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/abilities/partners/ksf-runtime/partner.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/persona-manager/partner.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/abilities/partners/project-manager/partner.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/abilities/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/abilities/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/activity-monitor/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/activity-monitor/package-lock.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/activity-monitor/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/conversations/manifest.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/conversations/package.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/conversations/src/app.tsx` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/conversations/src/components/routes.tsx` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/conversations/src/targets.ts` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/conversations/src/types.ts` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/cooperation-center/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/cooperation-center/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/cooperation-center/tests/browser-fixture.mjs` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/cooperation-center/tests/workflows.test.mjs` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/documentation/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/documentation/package-lock.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/documentation/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/documents/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/documents/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/git/backend/git-settings.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/git/backend/workbench-git.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/git/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/git/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/knowledge/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/knowledge/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/projects/manifest.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/projects/package-lock.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/projects/package.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/sdk/README.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/build.mjs` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/package-lock.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/package.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/sdk/server/protocol.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/src/application-sdk.ts` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/src/index.ts` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/sdk/src/types.ts` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/templates/ai-task/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/templates/cards/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/templates/collaboration/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/templates/service/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/templates/window/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/sdk/templates/workflow-provider/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.abilities-0.2.2.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.activity-monitor-0.1.5.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.conversations-0.3.5.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.cooperation-center-0.4.3.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.documentation-0.1.6.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.git-0.1.16.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.knowledge-0.2.2.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.markdown-0.1.13.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/com.ksf.projects-0.3.4.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/store/index.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/applications/store/terminal-0.1.8.ksfapp` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/terminal/manifest.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/terminal/package-lock.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/applications/terminal/package.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/build.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/data-compatibility.json` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/distribution/repository/.github/workflows/check.yml` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/distribution/repository/.github/workflows/verification.yml` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/docs/app-development/manifest.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/app-development/release.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/app-development/sdk-compatibility.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/app-development/validation.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/applications.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/catalog.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/cli/chat.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/cli/context.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/cli/index.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/cli/objects.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/cli/overview.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/cli/system.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/cli/task.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/cli/test.md` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/docs/content-design.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/four-core-mechanisms.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/objects/knowledge.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/objects/overview.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/objects/project.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/project-management.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/runtime/materials.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/runtime/minimal-runtime.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/runtime/routing.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/runtime/task-checkpoints.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/runtime/user-collaboration.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/docs/system/user-data.md` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/docs/testing.md` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/docs/对象元数据规范.md` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/manifest.yaml` | 仅PR修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/applications/core-upgrade.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/applications/manager.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/applications/protocol.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/cli.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/commands/ability-manager.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/commands/context.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/commands/tasks.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/commands/test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/data-compatibility.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/distribution/system.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/migrations/ability-manager.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/objects/legacy.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/objects/schema.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/routing/definitions.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/routing/schema.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/routing/target-identity.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/routing/view-targets.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/services/build-manifest.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/services/collaboration-context.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/services/core-host.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/services/entry-context.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/services/orphan-competencies.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/services/tasks.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/services/web-about.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/services/web.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/shared/managed-path.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/shared/material-files.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/task-capture/targets.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/src/testing/catalog.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/ci-coverage.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/ci-plan.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/ci.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/coverage-audit.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/fixtures.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/planner.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/runner.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/testing/selection.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/src/user-data/records.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/src/user-data/storage.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/testing/catalog.json` | 双方修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/testing/coverage-baseline.json` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/application-background.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/application-offline-origin.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tests/application-sdk-compatibility.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tests/background-service.test.js` | 双方修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/build.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tests/ci-dependencies.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/communication-native.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/communication-pairing-native.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/communication-pairing.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/communication.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/configuration.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tests/contribute-baseline.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/contribute-native.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/core-application-plan.test.js` | 双方修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/core-application-recovery.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/distribution-fixture.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/distribution-native.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/distribution-policy.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/distribution.test.js` | 双方修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/four-targets.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tests/helpers/core-application-fixture.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/helpers/distribution-fixture.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/helpers/prepare-distribution.mjs` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/minimal-runtime.test.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/tests/release-actions-contract.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/runtime-management-refactor.test.js` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/tests/system-update-applications.test.js` | 双方修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/testing-policy.test.js` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.agents/core/runtime/tests/web-about.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tests/web.test.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/tools/material-files.mjs` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/web/dist/.vite/manifest.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/web/dist/assets/app-store-BDReXKhG.js` | 仅PR修改 | 保留主线删除决定 |
| `.agents/core/runtime/web/dist/assets/app-store-DtygiV_o.js` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/web/dist/assets/index-CP7NUXon.js` | 仅PR修改 | 保留主线删除决定 |
| `.agents/core/runtime/web/dist/build.json` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/web/dist/index.html` | 双方修改 | 采用当前主线较新实现/产物 |
| `.agents/core/runtime/web/src/apps/app-store.tsx` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/web/src/apps/application-model.ts` | 主线状态一致 | 主线已含相同状态 |
| `.agents/core/runtime/web/src/desktop/about-dialog.tsx` | 主线状态一致 | 主线已含相同状态 |
| `.agents/ksf` | 主线状态一致 | 主线已含相同状态 |
| `.agents/ksf.ps1` | 主线状态一致 | 主线已含相同状态 |
| `.github/workflows/check.yml` | 仅PR修改 | 保留并整合测试/CI增量 |
| `.github/workflows/verification.yml` | 仅PR修改 | 保留并整合测试/CI增量 |
| `AGENTS.md` | 双方修改 | 采用当前主线较新实现/产物 |

## 验证入口

本次本机验证及最新同提交 Actions 结果记录在 PR23 的验证结果。历史 CI 仅作为原提交的历史证据，整合提交需要独立完成验证。

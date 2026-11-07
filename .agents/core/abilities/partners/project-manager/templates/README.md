# 正式项目模板

这些模板属于项目管理能力定义，元数据由程序defaultMetadata生成并按对象用途补全。替换ID、路径、目标和条件，未知留空。项目/里程碑/任务统一六主状态；可开始从当前事实计算，受阻保存在blocker。

- [project.md](project.md)
- [milestone.md](milestone.md)
- [task.md](task.md)
- [milestone-review.md](milestone-review.md)
- [project-review.md](project-review.md)
- [inspiration.md](inspiration.md)

模板是起点，必须经公共 check/apply 校验。普通任务建目录、task.md 和灵感闪现.md。用户主动要求留存材料时，才创建对应的编号上下文。

项目根目录放 project.md、M1-阶段结果/、项目复盘.md 和经用户要求创建的 P 编号材料。里程碑目录放 milestone.md、A1-工作/、复盘.md 和经用户要求创建的 M 编号材料。任务的 00、10、20 等编号上下文与 task.md 同级。三层都在主文同级放 [灵感闪现](inspiration.md)，供用户记录本层想法。

新任务目录采用B1-具体工作等字母阶段编号；task_code与目录一致。milestone.md只保留实际需要的task_stages，名称、目的和推进判断由用户定义；模板A/B/Z可按实际简化。旧任务改号须走公共renumber预览与提交，不能直接改目录名。

新任务使用公共 create-task 按模板职责生成。传入阶段和业务信息，编号、稳定 ID、路径、milestone.tasks 索引和 task_counters 由程序维护。预览不占号。

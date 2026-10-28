# 应用所属桌面卡片

卡片类型是应用清单中的cards项；卡片实例是用户添加到某桌面分组的一张卡片。同一类型允许多张，不能把类型ID当实例ID。

| 身份/状态 | 用途 |
| --- | --- |
| appId/version | 所属应用与运行版本 |
| cardId | 应用内稳定类型ID |
| surfaceId | 稳定界面身份，包含桌面分组与实例 |
| instanceId | 当前后端租约，重启后改变，不能作为业务持久主键 |
| configuration | 当前卡片实例配置，与其他卡片隔离 |
| width/height | 宿主投影后的CSS像素；清单尺寸仍是网格数 |
| enabled/active/compact | 可见/可用、活动及紧凑布局提示 |

## 配置和渲染

```ts
export function mount(container,sdk){
 const render=()=>{const config=sdk.configuration.get()??{};container.textContent='项目：'+(config.projectId??'未选择')};
 const unsubscribe=sdk.subscribe(render);render();
 return {dispose(){unsubscribe();container.replaceChildren()}};
}
// 用户更改卡片选项时：sdk.configuration.set({schemaVersion:1,projectId:'demo'})
```

配置必须是无循环、无undefined/函数/BigInt、无非有限数值的JSON值，每实例最多64 KiB。设置前校验，失败保留原配置，错误码为APP_CARD_CONFIG_INVALID或APP_CARD_CONFIG_TOO_LARGE。建议配置自带schemaVersion；升级时明确迁移，不能把读不到的配置重置为空并覆盖。

卡片显示摘要、状态和明确动作。需要复杂编辑时打开所属应用；无主窗口应用应提供卡片内可完成的设置或操作，不调用不存在的窗口。sdk.openApp可打开有主窗口的相关应用。

## 刷新与恢复

不可见、切换分组、编辑布局或页面隐藏时暂停非必要刷新。恢复可见后核对最近快照和更新时间。轮询必须有间隔、错误退避和清理；共享后端缓存，不能每张卡重复触发昂贵AI任务。

渲染/刷新不能隐式提交新的模型任务。AI生成由明确用户动作或已配置的业务后台触发，卡片只观察保存结果。展示加载、空、过期、失败和可重试状态，不能把读取失败显示成数值0。

桌面v3保存实例、所属应用、类型、配置、几何及分组；v1/v2旧统计卡片映射到conversations/work-stats。应用暂缺、停用、卸载或注册表失败保留占位与布局；重装按原实例恢复。升级时旧窗口/任务排空后统一切换卡片，卡片不永久阻挡升级。

拖动、缩放、分组和键盘操作由宿主负责。应用不修改网格DOM或桌面存储键。至少验证最小尺寸、默认尺寸、同类双实例、两种类型及缺失恢复。完整可运行实现见cards模板。

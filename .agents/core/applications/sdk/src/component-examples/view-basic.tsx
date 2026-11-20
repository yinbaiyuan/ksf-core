import {View} from '@ksf/sdk/view';

export function ViewBasicExample() {
  return <View style={{padding: 24, gap: 16}}>
    <h1>应用内容</h1>
    <View direction="row" style={{gap: 16, flexWrap: 'wrap'}}>
      <View style={{flex: 1}}>主要内容</View>
      <View theme="dark" style={{flex: 1}}>局部深色区域</View>
    </View>
  </View>;
}

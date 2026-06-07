import type { UserConfigExport } from '@tarojs/cli'

export default {
  mini: {},
  h5: {
    compile: {
      include: [],
    },
  },
} satisfies UserConfigExport<'webpack5'>

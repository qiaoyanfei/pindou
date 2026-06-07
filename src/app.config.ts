export default defineAppConfig({
  pages: ['pages/index/index', 'pages/preview/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '拼豆图纸',
    navigationBarTextStyle: 'black',
  },
  permission: {
    'scope.writePhotosAlbum': {
      desc: '用于保存生成的拼豆图纸到相册',
    },
  },
})

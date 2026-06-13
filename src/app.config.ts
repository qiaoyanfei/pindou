export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/generate/index',
    'pages/advanced-settings/index',
    'pages/mine/index',
    'pages/login/index',
    'pages/preview/index',
    'pages/post-detail/index',
    'pages/publish/index',
    'pages/publish-success/index',
    'pages/drafts/index',
    'pages/my-likes/index',
    'pages/my-favorites/index',
    'pages/my-posts/index',
    'pages/beans/index',
    'pages/feedback/index',
    'pages/feedback-form/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '拼豆豆',
    navigationBarTextStyle: 'black',
  },
  permission: {
    'scope.writePhotosAlbum': {
      desc: '用于保存生成的拼豆豆图纸到相册',
    },
  },
})

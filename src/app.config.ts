export default defineAppConfig({
  lazyCodeLoading: 'requiredComponents',
  permission: {
    'scope.writePhotosAlbum': {
      desc: '用于将生成的拼豆图纸保存到您的相册',
    },
    'scope.camera': {
      desc: '用于拍摄上传拼豆参考照片',
    },
  },
  pages: [
    'pages/home/index',
    'pages/generate/index',
    'pages/mine/index',
    'pages/login/index',
    'pages/user-agreement/index',
    'pages/privacy-policy/index',
    'pages/preview/index',
    'pages/color-detail/index',
    'pages/pattern-edit/index',
    'pages/post-detail/index',
    'pages/my-post-detail/index',
    'pages/publish/index',
    'pages/publish-success/index',
    'pages/drafts/index',
    'pages/my-likes/index',
    'pages/my-favorites/index',
    'pages/my-posts/index',
    'pages/beans/index',
    'pages/feedback/index',
    'pages/feedback-form/index',
    'pages/admin-review/index',
    'pages/admin-author-posts/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'happy拼豆嘛',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    custom: true,
    color: '#9ca3af',
    selectedColor: '#7c3aed',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
      },
      {
        pagePath: 'pages/generate/index',
        text: '生成',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
      },
    ],
  },
})

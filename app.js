App({
  globalData: { statusBarHeight: 20 },
  onLaunch() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.globalData.statusBarHeight = (info && info.statusBarHeight) || 20
    } catch (e) {}
  }
})
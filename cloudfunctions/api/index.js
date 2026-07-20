const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_CONFIG = {
  downloadCost: 2,
  publishReward: 3,
  registerReward: 5,
  inviteReward: 5,
  shareReward: 2,
  /** 每人每日最多领取分享奖励次数，0 表示不限制 */
  dailyShareLimit: 3,
  feedbackWechatId: 'doudou_shouzuo',
  feedbackQrUrl: '',
  adminOpenIds: [],
  dailyPublishLimit: 5,
  publishWhitelistOpenIds: [],
}

async function checkTextSec(openid, content) {
  if (!content) return { ok: true }
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      openid,
      version: 2,
      scene: 3,
      content,
    })
    if (res.errCode === 0) return { ok: true }
    return { ok: false, message: '内容不符合规范，请修改后重试' }
  } catch (error) {
    console.warn('msgSecCheck skipped', error)
    return { ok: true }
  }
}

function resolveReviewStatus(post) {
  if (post?.reviewStatus) return post.reviewStatus
  return post?.visibility === 'public' ? 'approved' : 'draft'
}

function buildHistoryEntry(status, label, note) {
  return {
    status,
    label,
    note: note || '',
    createdAt: new Date().toISOString(),
  }
}

function prependHistory(history, entry) {
  const list = Array.isArray(history) ? history.slice() : []
  list.unshift(entry)
  return list.slice(0, 30)
}

function buildPostSearchText(post) {
  return [
    post?.title,
    post?.authorNickName,
    post?.category,
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

function buildGeneratedPostTitle(post) {
  const category = String(post?.category || '').trim()
  const styleMode = post?.styleMode === 'portrait' ? '写实风' : '漫画风'
  const width = Number(post?.width) || 0
  const height = Number(post?.height) || 0
  const size = width > 0 && height > 0 ? `${width}×${height}` : ''
  const shortId = String(post?._id || '').slice(-4).toUpperCase()
  return [
    `${category}${styleMode}拼豆图纸`,
    size,
    shortId ? `#${shortId}` : '',
  ].filter(Boolean).join(' ')
}

function normalizeAdminOpenIds(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

async function isAdmin(openid) {
  const config = await getConfig()
  const admins = normalizeAdminOpenIds(config.adminOpenIds)
  const normalizedOpenid = String(openid || '').trim()
  return admins.some((item) => item === normalizedOpenid)
}

function normalizePublishWhitelistOpenIds(value) {
  return normalizeAdminOpenIds(value)
}

function isPublishLimitExempt(openid, config) {
  const normalizedOpenid = String(openid || '').trim()
  const whitelist = [
    ...normalizeAdminOpenIds(config.adminOpenIds),
    ...normalizePublishWhitelistOpenIds(config.publishWhitelistOpenIds),
  ]
  return whitelist.some((item) => item === normalizedOpenid)
}

/** 北京时间当日 00:00 ~ 次日 00:00，用于按自然日统计发布次数 */
function getChinaDayRange(now = new Date()) {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const chinaNow = new Date(utcMs + 8 * 3600000)
  const chinaStart = Date.UTC(
    chinaNow.getUTCFullYear(),
    chinaNow.getUTCMonth(),
    chinaNow.getUTCDate(),
  )
  const start = new Date(chinaStart - 8 * 3600000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

async function getTodayPublishCount(openid) {
  const { start, end } = getChinaDayRange()
  const res = await db.collection('posts')
    .where({
      _openid: openid,
      createdAt: _.gte(start).and(_.lt(end)),
    })
    .count()
  return res.total || 0
}

async function assertDailyPublishAllowed(openid) {
  const config = await getConfig()
  if (isPublishLimitExempt(openid, config)) return null

  const limit = Number(config.dailyPublishLimit)
  if (!Number.isFinite(limit) || limit <= 0) return null

  const count = await getTodayPublishCount(openid)
  if (count >= limit) {
    return fail(`今日发布次数已达上限（${limit} 次），请明天再试`)
  }
  return null
}

async function validatePublishText(openid, title, description) {
  const titleCheck = await checkTextSec(openid, title)
  if (!titleCheck.ok) return titleCheck
  if (description) {
    return checkTextSec(openid, description)
  }
  return { ok: true }
}

function mapPostSummary(post) {
  return {
    ...post,
    reviewStatus: resolveReviewStatus(post),
    author: {
      nickName: resolveDisplayNickName(post.authorNickName, post._openid),
      avatarUrl: post.authorAvatarUrl || '',
      openid: post._openid,
    },
  }
}

function ok(data) {
  return { ok: true, data }
}

function fail(message) {
  return { ok: false, message }
}

const DEFAULT_USER_BIO = '拼出美好，分享快乐 ✨'

const NICK_PREFIXES = ['软萌', '元气', '像素', '创意', '手工', '可爱', '迷你', '糖果', '治愈', '复古']
const NICK_SUFFIXES = ['拼豆手', '豆豆酱', '拼豆人', '豆匠', '小豆子', '拼友', '豆友', '制作人', '手作娘', '拼贴师']

function generateRandomNickname(seed) {
  if (seed) return generateRandomNicknameFromSeed(seed)
  const prefix = NICK_PREFIXES[Math.floor(Math.random() * NICK_PREFIXES.length)]
  const suffix = NICK_SUFFIXES[Math.floor(Math.random() * NICK_SUFFIXES.length)]
  const num = Math.floor(Math.random() * 900) + 100
  return `${prefix}${suffix}${num}`
}

function generateRandomNicknameFromSeed(seed) {
  let hash = 0
  const value = String(seed || '')
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash + value.charCodeAt(i)) | 0
  }
  const abs = Math.abs(hash)
  const prefixIndex = abs % NICK_PREFIXES.length
  const suffixIndex = Math.floor(abs / NICK_PREFIXES.length) % NICK_SUFFIXES.length
  const num = (abs % 900) + 100
  return `${NICK_PREFIXES[prefixIndex]}${NICK_SUFFIXES[suffixIndex]}${num}`
}

function resolveDisplayNickName(nickName, openid) {
  const value = String(nickName || '').trim()
  if (value && !isLegacyDefaultNickName(value)) return value.slice(0, 20)
  return generateRandomNicknameFromSeed(openid)
}

function normalizeStoredNickName(nickName, openid) {
  return resolveDisplayNickName(nickName, openid)
}

function isLegacyDefaultNickName(nickName) {
  const value = String(nickName || '').trim()
  return !value || value === '拼豆玩家' || value === '微信用户'
}

const https = require('https')
const http = require('http')

function downloadBuffer(url, redirectLimit = 3) {
  return new Promise((resolve, reject) => {
    if (redirectLimit <= 0) {
      reject(new Error('too many redirects'))
      return
    }
    const client = String(url).startsWith('https') ? https : http
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBuffer(res.headers.location, redirectLimit - 1).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`download failed: ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function persistAvatarUrl(avatarUrl) {
  if (!avatarUrl) return ''
  const value = String(avatarUrl).trim()
  if (value.startsWith('cloud://')) return value
  if (!value.startsWith('http://') && !value.startsWith('https://')) return ''
  try {
    const buffer = await downloadBuffer(value)
    const upload = await cloud.uploadFile({
      cloudPath: `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
      fileContent: buffer,
    })
    return upload.fileID || ''
  } catch (error) {
    console.warn('persistAvatarUrl failed', error)
    return ''
  }
}

async function getConfig() {
  const res = await db.collection('app_config').get()
  if (!res.data.length) return { ...DEFAULT_CONFIG }
  const merged = { ...DEFAULT_CONFIG }
  const adminOpenIds = []
  const publishWhitelistOpenIds = []
  res.data.forEach((doc) => {
    Object.assign(merged, doc)
    adminOpenIds.push(...normalizeAdminOpenIds(doc.adminOpenIds))
    publishWhitelistOpenIds.push(...normalizePublishWhitelistOpenIds(doc.publishWhitelistOpenIds))
  })
  if (adminOpenIds.length) {
    merged.adminOpenIds = [...new Set(adminOpenIds)]
  }
  if (publishWhitelistOpenIds.length) {
    merged.publishWhitelistOpenIds = [...new Set(publishWhitelistOpenIds)]
  }
  merged.dailyPublishLimit = Number(merged.dailyPublishLimit)
  if (!Number.isFinite(merged.dailyPublishLimit) || merged.dailyPublishLimit < 0) {
    merged.dailyPublishLimit = DEFAULT_CONFIG.dailyPublishLimit
  }
  merged.dailyShareLimit = Number(merged.dailyShareLimit)
  if (!Number.isFinite(merged.dailyShareLimit) || merged.dailyShareLimit < 0) {
    merged.dailyShareLimit = DEFAULT_CONFIG.dailyShareLimit
  }
  return merged
}

async function getTodayShareRewardCount(openid) {
  const { start, end } = getChinaDayRange()
  const res = await db.collection('bean_transactions')
    .where({
      _openid: openid,
      title: '分享奖励',
      createdAt: _.gte(start).and(_.lt(end)),
    })
    .count()
  return res.total || 0
}

async function getUser(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get()
  if (!res.data.length) return null
  if (res.data.length === 1) return res.data[0]
  return dedupeUsers(openid)
}

async function dedupeUsers(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get()
  if (!res.data.length) return null
  if (res.data.length === 1) return res.data[0]

  const primary = res.data.reduce((best, current) => {
    const bestBalance = Number(best.beanBalance) || 0
    const currentBalance = Number(current.beanBalance) || 0
    return currentBalance >= bestBalance ? current : best
  })

  await Promise.all(
    res.data
      .filter((item) => item._id !== primary._id)
      .map((item) => db.collection('users').doc(item._id).remove()),
  )

  return primary
}

function normalizeUser(user, openid) {
  if (!user) return null
  return {
    ...user,
    openid: user._openid || openid,
    beanBalance: Math.max(0, Number(user.beanBalance) || 0),
  }
}

async function syncBeanBalanceFromLogs(openid, user) {
  if (!user) return null
  const currentBalance = Math.max(0, Number(user.beanBalance) || 0)
  if (currentBalance > 0) return user

  const logs = await db.collection('bean_transactions').where({ _openid: openid }).get()
  if (!logs.data.length) return user

  let computed = 0
  logs.data.forEach((item) => {
    const amount = Number(item.amount) || 0
    if (item.type === 'income') computed += amount
    else if (item.type === 'expense') computed -= amount
  })
  computed = Math.max(0, computed)
  if (computed === currentBalance) return user

  await db.collection('users').doc(user._id).update({
    data: { beanBalance: computed, updatedAt: db.serverDate() },
  })
  return { ...user, beanBalance: computed }
}

async function ensureUser(openid, profile = {}) {
  const config = await getConfig()
  const now = db.serverDate()

  let existing = await getUser(openid)
  if (existing) {
    const updateData = { updatedAt: now }
    if (profile.nickName && !isLegacyDefaultNickName(profile.nickName)) {
      updateData.nickName = String(profile.nickName).trim().slice(0, 20)
    } else if (isLegacyDefaultNickName(existing.nickName)) {
      updateData.nickName = normalizeStoredNickName('', openid)
    }
    if (profile.avatarUrl) {
      const normalizedAvatar = await persistAvatarUrl(profile.avatarUrl)
      if (normalizedAvatar) updateData.avatarUrl = normalizedAvatar
    }
    if (profile.nickName || profile.avatarUrl) {
      await db.collection('users').doc(existing._id).update({ data: updateData })
      existing = await getUser(openid)
    }
    const synced = await syncBeanBalanceFromLogs(openid, existing)
    return { ...synced, isNew: false }
  }

  const inviterId = profile.inviterId || ''
  const normalizedAvatar = profile.avatarUrl ? await persistAvatarUrl(profile.avatarUrl) : ''
  const userDoc = {
    _openid: openid,
    nickName: normalizeStoredNickName(profile.nickName, openid),
    avatarUrl: normalizedAvatar,
    beanBalance: config.registerReward,
    level: 1,
    bio: DEFAULT_USER_BIO,
    inviterId,
    createdAt: now,
    updatedAt: now,
  }
  const addRes = await db.collection('users').add({ data: userDoc })

  const siblings = await db.collection('users').where({ _openid: openid }).get()
  const primary = siblings.data.length
    ? siblings.data.sort((a, b) => String(a._id).localeCompare(String(b._id)))[0]
    : null

  if (!primary || primary._id !== addRes._id) {
    try {
      await db.collection('users').doc(addRes._id).remove()
    } catch (error) {
      console.error('remove duplicate user failed', error)
    }
    const raced = await getUser(openid)
    const synced = await syncBeanBalanceFromLogs(openid, raced)
    return { ...synced, isNew: false }
  }

  await db.collection('bean_transactions').add({
    data: {
      _openid: openid,
      type: 'income',
      amount: config.registerReward,
      title: '新用户注册奖励',
      subtitle: '欢迎加入happy拼豆嘛',
      createdAt: now,
    },
  })

  if (inviterId) {
    const inviter = await db.collection('users').where({ _openid: inviterId }).limit(1).get()
    if (inviter.data[0]) {
      await db.collection('users').doc(inviter.data[0]._id).update({
        data: { beanBalance: _.inc(config.inviteReward), updatedAt: now },
      })
      await db.collection('bean_transactions').add({
        data: {
          _openid: inviterId,
          type: 'income',
          amount: config.inviteReward,
          title: '邀请好友奖励',
          subtitle: '好友注册成功',
          createdAt: now,
        },
      })
    }
  }

  const created = await db.collection('users').doc(primary._id).get()
  return { ...created.data, isNew: true }
}

async function addBeanTransaction(openid, type, amount, title, subtitle) {
  const user = await getUser(openid)
  if (!user) return
  const nextBalance = type === 'income' ? user.beanBalance + amount : user.beanBalance - amount
  await db.collection('users').doc(user._id).update({
    data: { beanBalance: nextBalance, updatedAt: db.serverDate() },
  })
  await db.collection('bean_transactions').add({
    data: {
      _openid: openid,
      type,
      amount,
      title,
      subtitle: subtitle || '',
      createdAt: db.serverDate(),
    },
  })
}

function mapAuthor(user) {
  const openid = user?._openid
  return {
    nickName: resolveDisplayNickName(user?.nickName, openid),
    avatarUrl: user?.avatarUrl || '',
    openid,
  }
}

async function syncAuthorProfileToPosts(openid, user) {
  if (!user || !openid) return
  const displayNickName = resolveDisplayNickName(user.nickName, openid)
  const posts = await fetchAll(() => db.collection('posts').where({ _openid: openid }))
  const updates = posts
    .filter((post) => isLegacyDefaultNickName(post.authorNickName))
    .map((post) =>
      db.collection('posts').doc(post._id).update({
        data: {
          authorNickName: displayNickName,
          authorAvatarUrl: user.avatarUrl || post.authorAvatarUrl || '',
          searchText: buildPostSearchText({ ...post, authorNickName: displayNickName }),
          updatedAt: db.serverDate(),
        },
      }),
    )
  if (updates.length) await Promise.all(updates)
}

async function attachInteractionFlags(openid, posts) {
  if (!posts.length) return posts
  const ids = posts.map((p) => p._id)
  const [likes, favorites, downloads] = await Promise.all([
    db.collection('likes').where({ _openid: openid, postId: _.in(ids) }).get(),
    db.collection('favorites').where({ _openid: openid, postId: _.in(ids) }).get(),
    db.collection('downloads').where({ _openid: openid, postId: _.in(ids) }).get(),
  ])
  const likedSet = new Set(likes.data.map((item) => item.postId))
  const favoritedSet = new Set(favorites.data.map((item) => item.favoritePostId || item.postId))
  const downloadedSet = new Set(downloads.data.map((item) => item.postId))
  return posts.map((post) => ({
    ...post,
    liked: likedSet.has(post._id),
    favorited: favoritedSet.has(post._id),
    downloaded: downloadedSet.has(post._id),
  }))
}

async function repairOrphanPosts(openid, user) {
  if (!user) return
  const posts = await fetchAll(() =>
    db.collection('posts').where({
      authorNickName: user.nickName || '拼豆玩家',
      authorAvatarUrl: user.avatarUrl || '',
    }),
  )
  const orphans = posts.filter((post) => !post._openid)
  if (!orphans.length) return
  await Promise.all(
    orphans.map((post) =>
      db.collection('posts').doc(post._id).update({ data: { _openid: openid } }),
    ),
  )
}

async function queryUserPostsByVisibility(openid, visibility) {
  const res = await db.collection('posts')
    .where({ _openid: openid, visibility })
    .orderBy('publishedAt', 'desc')
    .get()
  return res.data
}

function getPagination(data, defaultPageSize = 20, maxPageSize = 50) {
  const page = Math.max(1, Number(data?.page || 1))
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(data?.pageSize || defaultPageSize)))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

function hasExplicitPagination(data) {
  if (!data) return false
  return Object.prototype.hasOwnProperty.call(data, 'page')
    || Object.prototype.hasOwnProperty.call(data, 'pageSize')
}

async function fetchAll(createQuery, pageSize = 100) {
  const list = []
  let skip = 0
  while (true) {
    const res = await createQuery().skip(skip).limit(pageSize).get()
    list.push(...res.data)
    if (res.data.length < pageSize) break
    skip += pageSize
  }
  return list
}

async function fetchPostsByIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  const list = []
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const chunk = uniqueIds.slice(start, start + 100)
    const res = await db.collection('posts').where({ _id: _.in(chunk) }).get()
    list.push(...res.data)
  }
  return list
}

async function buildLoginResponse(openid, user, options = {}) {
  const synced = await syncBeanBalanceFromLogs(openid, user)
  await repairOrphanPosts(openid, synced)
  await syncAuthorProfileToPosts(openid, synced)
  const [pendingCountRes, postCountRes] = await Promise.all([
    db.collection('posts').where({ _openid: openid, visibility: 'private' }).count(),
    db.collection('posts').where({ _openid: openid, visibility: 'public' }).count(),
  ])
  const config = await getConfig()
  const isNew = Boolean(options.isNew)
  const normalized = normalizeUser(synced, openid)
  return ok({
    user: {
      ...normalized,
      draftCount: pendingCountRes.total,
      postCount: postCountRes.total,
    },
    config,
    registerReward: isNew ? config.registerReward : 0,
  })
}

async function handleRewardShare(openid) {
  const user = await getUser(openid)
  if (!user) return fail('请先登录')

  const config = await getConfig()
  const amount = Number(config.shareReward)
  if (!Number.isFinite(amount) || amount <= 0) {
    return ok({ rewarded: false, amount: 0, beanBalance: user.beanBalance })
  }

  const limit = Number(config.dailyShareLimit)
  if (Number.isFinite(limit) && limit > 0) {
    const count = await getTodayShareRewardCount(openid)
    if (count >= limit) {
      return fail(`今日分享奖励已达上限（${limit} 次），明天再来吧`)
    }
  }

  await addBeanTransaction(openid, 'income', amount, '分享奖励', '分享给好友')
  const updated = await getUser(openid)
  return ok({
    rewarded: true,
    amount,
    beanBalance: updated?.beanBalance ?? user.beanBalance + amount,
  })
}

async function handleLogin(openid, data) {
  const refreshOnly = Boolean(data?.refreshOnly)

  if (refreshOnly) {
    const existing = await getUser(openid)
    if (!existing) {
      return fail('登录已失效，请重新登录')
    }
    if (existing.status === 'deleted' || existing.status === 'disabled') {
      return fail('账号已注销，请重新登录')
    }
    return buildLoginResponse(openid, existing, { isNew: false })
  }

  const user = await ensureUser(openid, data || {})
  return buildLoginResponse(openid, user, { isNew: Boolean(user.isNew) })
}

async function handleGetFeed(openid, data) {
  const tab = data?.tab === 'latest' ? 'latest' : 'recommend'
  const page = Math.max(1, Number(data?.page || 1))
  const pageSize = Math.min(20, Number(data?.pageSize || 10))
  const skip = (page - 1) * pageSize

  let query = db.collection('posts').where({ visibility: 'public' })
  if (tab === 'latest') {
    query = query.orderBy('publishedAt', 'desc')
  } else {
    query = query.orderBy('likeCount', 'desc').orderBy('publishedAt', 'desc')
  }

  const res = await query.skip(skip).limit(pageSize).get()
  const posts = res.data.map(mapPostSummary)
  const withFlags = await attachInteractionFlags(openid, posts)
  return ok({ list: withFlags, page, hasMore: res.data.length === pageSize })
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function handleSearchPosts(openid, data) {
  const keyword = String(data?.keyword || '').trim()
  const category = String(data?.category || '').trim()
  if (!keyword && !category) return ok({ list: [], page: 1, hasMore: false })

  const page = Math.max(1, Number(data?.page || 1))
  const pageSize = Math.min(30, Math.max(1, Number(data?.pageSize || 20)))
  const skip = (page - 1) * pageSize
  const filter = { visibility: 'public' }
  if (keyword) {
    filter.searchText = db.RegExp({ regexp: escapeRegExp(keyword.toLowerCase()), options: 'i' })
  }
  if (category) {
    filter.category = category
  }

  const res = await db.collection('posts')
    .where(filter)
    .orderBy('publishedAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()
  const posts = res.data.map(mapPostSummary)
  const withFlags = await attachInteractionFlags(openid, posts)
  return ok({ list: withFlags, page, hasMore: res.data.length === pageSize })
}

async function handleGetPost(openid, data) {
  const postId = data?.postId
  if (!postId) return fail('缺少 postId')
  const res = await db.collection('posts').doc(postId).get()
  const post = res.data
  if (!post) return fail('图纸不存在')
  const canViewPrivatePost = post._openid === openid || await isAdmin(openid)
  if (post.visibility !== 'public' && !canViewPrivatePost) return fail('无权查看')
  const [likes, favorites, downloads] = await Promise.all([
    db.collection('likes').where({ _openid: openid, postId }).limit(1).get(),
    db.collection('favorites').where({ _openid: openid, postId }).limit(1).get(),
    db.collection('downloads').where({ _openid: openid, postId }).limit(1).get(),
  ])
  return ok({
    post: {
      ...mapPostSummary(post),
      liked: likes.data.length > 0,
      favorited: favorites.data.length > 0,
      downloaded: downloads.data.length > 0,
    },
  })
}

async function handleToggleLike(openid, data) {
  const postId = data?.postId
  if (!postId) return fail('缺少 postId')
  const existing = await db.collection('likes').where({ _openid: openid, postId }).limit(1).get()
  const postRes = await db.collection('posts').doc(postId).get()
  if (!postRes.data) return fail('图纸不存在')

  if (existing.data.length > 0) {
    await db.collection('likes').doc(existing.data[0]._id).remove()
    await db.collection('posts').doc(postId).update({ data: { likeCount: _.inc(-1) } })
    return ok({ liked: false, likeCount: Math.max(0, (postRes.data.likeCount || 0) - 1) })
  }

  await db.collection('likes').add({
    data: { _openid: openid, postId, createdAt: db.serverDate() },
  })
  await db.collection('posts').doc(postId).update({ data: { likeCount: _.inc(1) } })
  return ok({ liked: true, likeCount: (postRes.data.likeCount || 0) + 1 })
}

async function handleToggleFavorite(openid, data) {
  const postId = data?.postId
  if (!postId) return fail('缺少 postId')
  const existing = await db.collection('favorites').where({ _openid: openid, postId }).limit(1).get()
  const postRes = await db.collection('posts').doc(postId).get()
  if (!postRes.data) return fail('图纸不存在')

  if (existing.data.length > 0) {
    await db.collection('favorites').doc(existing.data[0]._id).remove()
    await db.collection('posts').doc(postId).update({ data: { favoriteCount: _.inc(-1) } })
    return ok({ favorited: false, favoriteCount: Math.max(0, (postRes.data.favoriteCount || 0) - 1) })
  }

  await db.collection('favorites').add({
    data: { _openid: openid, postId, createdAt: db.serverDate() },
  })
  await db.collection('posts').doc(postId).update({ data: { favoriteCount: _.inc(1) } })
  return ok({ favorited: true, favoriteCount: (postRes.data.favoriteCount || 0) + 1 })
}

async function handleDownloadPost(openid, data) {
  const postId = data?.postId
  if (!postId) return fail('缺少 postId')
  const rewardedVideoCompleted = data?.rewardedVideoCompleted === true
  const chargeOnAdNotCompleted = data?.chargeOnAdNotCompleted === true
  const config = await getConfig()
  const user = await getUser(openid)
  if (!user) return fail('用户不存在')

  const existingDownload = await db.collection('downloads').where({ _openid: openid, postId }).limit(1).get()
  const postRes = await db.collection('posts').doc(postId).get()
  const post = postRes.data
  if (!post) return fail('图纸不存在')

  if (post._openid === openid) {
    return ok({ post: { ...post, downloaded: true }, charged: false })
  }

  if (existingDownload.data.length > 0) {
    return ok({ post: { ...post, downloaded: true }, charged: false })
  }

  if (!rewardedVideoCompleted && chargeOnAdNotCompleted) {
    if (user.beanBalance < config.downloadCost) return fail('小豆不足，请先发布图纸赚取小豆')
    await addBeanTransaction(openid, 'expense', config.downloadCost, '下载图纸消耗', `《${post.title}》`)
    const beanBalance = Math.max(0, (Number(user.beanBalance) || 0) - config.downloadCost)
    await db.collection('downloads').add({
      data: { _openid: openid, postId, beanCost: config.downloadCost, createdAt: db.serverDate() },
    })
    await db.collection('posts').doc(postId).update({ data: { downloadCount: _.inc(1) } })
    return ok({ post: { ...post, downloaded: true }, charged: true, beanCost: config.downloadCost, beanBalance })
  }

  if (rewardedVideoCompleted) {
    await db.collection('downloads').add({
      data: {
        _openid: openid,
        postId,
        beanCost: 0,
        rewardedVideoFree: true,
        createdAt: db.serverDate(),
      },
    })
    await db.collection('posts').doc(postId).update({ data: { downloadCount: _.inc(1) } })
    return ok({ post: { ...post, downloaded: true }, charged: false, rewardedVideoFree: true })
  }

  if (user.beanBalance < config.downloadCost) return fail('小豆不足，请先发布图纸赚取小豆')
  await addBeanTransaction(openid, 'expense', config.downloadCost, '下载图纸消耗', `《${post.title}》`)
  const beanBalance = Math.max(0, (Number(user.beanBalance) || 0) - config.downloadCost)
  await db.collection('downloads').add({
    data: { _openid: openid, postId, beanCost: config.downloadCost, createdAt: db.serverDate() },
  })
  await db.collection('posts').doc(postId).update({ data: { downloadCount: _.inc(1) } })
  return ok({ post: { ...post, downloaded: true }, charged: true, beanCost: config.downloadCost, beanBalance })
}

async function handleSaveDraft(openid, data) {
  const now = db.serverDate()
  const payload = {
    title: data?.title || '未命名图纸',
    coverFileId: data.coverFileId,
    patternFileId: data.patternFileId,
    width: data.width,
    height: data.height,
    styleMode: data.styleMode,
    paletteId: data.paletteId || 'mard221',
    stats: data.stats || {},
    totalBeads: data.totalBeads || 0,
    colorCount: data.colorCount || 0,
    config: data.config || {},
    updatedAt: now,
  }

  if (data?.draftId) {
    await db.collection('drafts').doc(data.draftId).update({ data: payload })
    return ok({ draftId: data.draftId })
  }

  const addRes = await db.collection('drafts').add({
    data: { ...payload, _openid: openid, createdAt: now },
  })
  return ok({ draftId: addRes._id })
}

async function handleGetDrafts(openid) {
  const res = await db.collection('drafts').where({ _openid: openid }).orderBy('updatedAt', 'desc').get()
  return ok({ list: res.data })
}

async function handleGetDraft(openid, data) {
  const draftId = data?.draftId
  if (!draftId) return fail('缺少 draftId')
  const res = await db.collection('drafts').doc(draftId).get()
  if (!res.data || res.data._openid !== openid) return fail('草稿不存在')
  return ok({ draft: res.data })
}

async function handleDeleteDraft(openid, data) {
  const draftId = data?.draftId
  if (!draftId) return fail('缺少 draftId')
  const res = await db.collection('drafts').doc(draftId).get()
  if (!res.data || res.data._openid !== openid) return fail('草稿不存在')
  await db.collection('drafts').doc(draftId).remove()
  return ok({ draftId })
}

async function handleDeletePost(openid, data) {
  const postId = data?.postId
  if (!postId) return fail('缺少 postId')
  const res = await db.collection('posts').doc(postId).get()
  if (!res.data || res.data._openid !== openid) return fail('无权操作')

  const cleanupTasks = [
    db.collection('likes').where({ postId }).remove(),
    db.collection('favorites').where({ postId }).remove(),
    db.collection('downloads').where({ postId }).remove(),
  ]
  await Promise.allSettled(cleanupTasks)
  await db.collection('posts').doc(postId).remove()
  return ok({ postId })
}

async function handlePublishPost(openid, data) {
  if (!data?.coverFileId || !data?.patternFileId) return fail('缺少图纸文件，请重新发布')
  if (data.postId) {
    return handleUpdatePostContent(openid, data)
  }

  const title = String(data?.title || '').trim() || '标题待生成'
  const description = ''

  const publishLimitError = await assertDailyPublishAllowed(openid)
  if (publishLimitError) return publishLimitError

  const now = db.serverDate()
  const user = await getUser(openid)
  const wantsPublic = data.visibility === 'public'
  let reviewStatus = wantsPublic ? 'pending' : 'draft'
  let reviewNote = ''
  let history = [
    buildHistoryEntry(
      reviewStatus,
      wantsPublic ? '提交审核' : '保存到待发布',
    ),
  ]

  if (wantsPublic) {
    const textCheck = await validatePublishText(openid, title, description)
    if (!textCheck.ok) {
      reviewStatus = 'rejected'
      reviewNote = textCheck.message || '内容不符合规范'
      history = prependHistory(history, buildHistoryEntry('rejected', '审核未通过', reviewNote))
    }
  }

  const postDoc = {
    _openid: openid,
    title,
    description,
    category: data.category,
    visibility: 'private',
    reviewStatus,
    reviewNote,
    reviewHistory: history,
    coverFileId: data.coverFileId,
    sheetFileId: data.sheetFileId || '',
    patternFileId: data.patternFileId,
    sourceImageFileId: data.sourceImageFileId || '',
    width: data.width,
    height: data.height,
    styleMode: data.styleMode,
    paletteId: data.paletteId || 'mard221',
    stats: data.stats || {},
    totalBeads: data.totalBeads || 0,
    colorCount: data.colorCount || 0,
    config: data.config || {},
    authorNickName: resolveDisplayNickName(user?.nickName, openid),
    authorAvatarUrl: user?.avatarUrl || '',
    likeCount: 0,
    favoriteCount: 0,
    downloadCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  }
  postDoc.searchText = buildPostSearchText(postDoc)

  const addRes = await db.collection('posts').add({ data: postDoc })

  if (data.draftId) {
    try {
      await db.collection('drafts').doc(data.draftId).remove()
    } catch (e) {
      // ignore
    }
  }

  return ok({
    postId: addRes._id,
    reward: 0,
    reviewStatus,
  })
}

async function handleUpdatePostContent(openid, data) {
  const postId = data.postId
  const res = await db.collection('posts').doc(postId).get()
  if (!res.data || res.data._openid !== openid) return fail('无权操作')
  const post = res.data
  const now = db.serverDate()
  const user = await getUser(openid)
  const wantsPublic = data.visibility === 'public'
  const providedTitle = String(data?.title || '').trim()
  const existingTitle = String(post.title || '').trim()
  const title = providedTitle
    || (wantsPublic ? (existingTitle || '标题待生成') : (existingTitle || '标题待生成'))
  const description = String(post.description || '').trim() || ''

  let reviewStatus = wantsPublic ? 'pending' : 'draft'
  let reviewNote = ''
  let history = prependHistory(
    post.reviewHistory,
    buildHistoryEntry(reviewStatus, wantsPublic ? '更新并提交审核' : '更新保存'),
  )

  if (wantsPublic) {
    const textCheck = await validatePublishText(openid, title, description)
    if (!textCheck.ok) {
      reviewStatus = 'rejected'
      reviewNote = textCheck.message || '内容不符合规范'
      history = prependHistory(history, buildHistoryEntry('rejected', '审核未通过', reviewNote))
    }
  }

  const sourceImageFileId = data.sourceImageFileId || post.sourceImageFileId || ''
  const updateDoc = {
    title,
    description,
    category: data.category,
    visibility: 'private',
    reviewStatus,
    reviewNote,
    reviewHistory: history,
    coverFileId: data.coverFileId,
    sheetFileId: data.sheetFileId || post.sheetFileId || '',
    patternFileId: data.patternFileId,
    sourceImageFileId,
    width: data.width,
    height: data.height,
    styleMode: data.styleMode,
    paletteId: data.paletteId || 'mard221',
    stats: data.stats || {},
    totalBeads: data.totalBeads || 0,
    colorCount: data.colorCount || 0,
    config: data.config || {},
    authorNickName: resolveDisplayNickName(user?.nickName, openid),
    authorAvatarUrl: user?.avatarUrl || '',
    updatedAt: now,
  }
  updateDoc.searchText = buildPostSearchText({ ...post, ...updateDoc })

  await db.collection('posts').doc(postId).update({ data: updateDoc })

  return ok({
    postId,
    reward: 0,
    reviewStatus,
  })
}

async function handleUpdatePostVisibility(openid, data) {
  const postId = data?.postId
  const visibility = data?.visibility
  if (!postId || !visibility) return fail('参数不完整')
  const res = await db.collection('posts').doc(postId).get()
  if (!res.data || res.data._openid !== openid) return fail('无权操作')
  const post = res.data
  const now = db.serverDate()

  if (visibility === 'public') {
    const currentTitle = String(post.title || '').trim()
    const title = currentTitle && currentTitle !== '标题待生成' ? currentTitle : '标题待生成'
    const description = ''
    const textCheck = await validatePublishText(openid, title, description)
    let reviewStatus = 'pending'
    let reviewNote = ''
    let history = prependHistory(
      post.reviewHistory,
      buildHistoryEntry('pending', '提交审核'),
    )
    if (!textCheck.ok) {
      reviewStatus = 'rejected'
      reviewNote = textCheck.message || '内容不符合规范'
      history = prependHistory(history, buildHistoryEntry('rejected', '审核未通过', reviewNote))
    }
    await db.collection('posts').doc(postId).update({
      data: {
        visibility: 'private',
        title,
        description,
        reviewStatus,
        reviewNote,
        reviewHistory: history,
        searchText: buildPostSearchText({ ...post, title, description }),
        updatedAt: now,
      },
    })
    return ok({ postId, visibility: 'private', reviewStatus })
  }

  if (visibility === 'private' && post.visibility === 'public') {
    const history = prependHistory(
      post.reviewHistory,
      buildHistoryEntry('draft', '转为待发布'),
    )
    await db.collection('posts').doc(postId).update({
      data: {
        visibility: 'private',
        reviewStatus: 'draft',
        reviewNote: '',
        reviewHistory: history,
        updatedAt: now,
      },
    })
    return ok({ postId, visibility: 'private', reviewStatus: 'draft' })
  }

  return ok({ postId, visibility: post.visibility, reviewStatus: resolveReviewStatus(post) })
}

async function handleCheckAdmin(openid) {
  const config = await getConfig()
  return ok({
    isAdmin: await isAdmin(openid),
    openid,
    adminCount: normalizeAdminOpenIds(config.adminOpenIds).length,
  })
}

async function handleGetReviewQueue(openid) {
  if (!(await isAdmin(openid))) return fail('无审核权限')
  const res = await db.collection('posts')
    .where({ reviewStatus: 'pending' })
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get()
  return ok({ list: res.data.map(mapPostSummary) })
}

async function handleGetReviewAuthorPosts(openid, data) {
  if (!(await isAdmin(openid))) return fail('无审核权限')
  const authorOpenid = String(data?.authorOpenid || '').trim()
  if (!authorOpenid) return fail('缺少作者信息')

  const publishedFilter = { _openid: authorOpenid, visibility: 'public' }
  const pendingFilter = { _openid: authorOpenid, visibility: 'private', reviewStatus: 'pending' }

  if (!hasExplicitPagination(data) && !Object.prototype.hasOwnProperty.call(data || {}, 'tab')) {
    const [publishedRes, pendingRes] = await Promise.all([
      fetchAll(() =>
        db.collection('posts')
          .where(publishedFilter)
          .orderBy('publishedAt', 'desc'),
      ),
      fetchAll(() =>
        db.collection('posts')
          .where(pendingFilter)
          .orderBy('updatedAt', 'desc'),
      ),
    ])

    return ok({
      published: publishedRes.map(mapPostSummary),
      pending: pendingRes.map(mapPostSummary),
    })
  }

  const tab = data?.tab === 'pending' ? 'pending' : 'published'
  const activeFilter = tab === 'pending' ? pendingFilter : publishedFilter
  const orderField = tab === 'pending' ? 'updatedAt' : 'publishedAt'
  const { page, pageSize, skip } = getPagination(data)

  const [listRes, activeCountRes, publishedCountRes, pendingCountRes] = await Promise.all([
    db.collection('posts')
      .where(activeFilter)
      .orderBy(orderField, 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('posts').where(activeFilter).count(),
    db.collection('posts').where(publishedFilter).count(),
    db.collection('posts').where(pendingFilter).count(),
  ])

  return ok({
    tab,
    list: listRes.data.map(mapPostSummary),
    page,
    total: activeCountRes.total,
    publishedTotal: publishedCountRes.total,
    pendingTotal: pendingCountRes.total,
    hasMore: skip + listRes.data.length < activeCountRes.total,
  })
}

async function handleReviewPost(openid, data) {
  if (!(await isAdmin(openid))) return fail('无审核权限')
  const postId = data?.postId
  const action = data?.action
  const note = String(data?.note || '').trim()
  const reviewTitle = String(data?.reviewTitle || '').trim()
  if (!postId || !action) return fail('参数不完整')

  const res = await db.collection('posts').doc(postId).get()
  const post = res.data
  if (!post) return fail('图纸不存在')
  if (resolveReviewStatus(post) !== 'pending') return fail('该作品不在审核队列中')

  const config = await getConfig()
  const now = db.serverDate()

  if (action === 'approve') {
    const existingTitle = String(post.title || '').trim()
    const finalTitle = reviewTitle
      || (existingTitle && existingTitle !== '标题待生成' ? existingTitle : buildGeneratedPostTitle(post))
    const textCheck = await validatePublishText(post._openid, finalTitle, post.description)
    if (!textCheck.ok) return fail(textCheck.message || '标题不符合规范')
    const nextPost = { ...post, title: finalTitle }
    const history = prependHistory(
      post.reviewHistory,
      buildHistoryEntry('approved', '审核通过'),
    )
    await db.collection('posts').doc(postId).update({
      data: {
        visibility: 'public',
        title: finalTitle,
        reviewStatus: 'approved',
        reviewNote: '',
        reviewHistory: history,
        searchText: buildPostSearchText(nextPost),
        publishedAt: now,
        updatedAt: now,
      },
    })
    await addBeanTransaction(
      post._openid,
      'income',
      config.publishReward,
      '发布图纸奖励',
      `《${finalTitle}》`,
    )
    return ok({ postId, reviewStatus: 'approved' })
  }

  if (action === 'reject') {
    if (!note) return fail('请填写驳回意见')
    const rejectNote = note
    const history = prependHistory(
      post.reviewHistory,
      buildHistoryEntry('rejected', '审核未通过', rejectNote),
    )
    await db.collection('posts').doc(postId).update({
      data: {
        visibility: 'private',
        reviewStatus: 'rejected',
        reviewNote: rejectNote,
        reviewHistory: history,
        updatedAt: now,
      },
    })
    return ok({ postId, reviewStatus: 'rejected' })
  }

  return fail('未知审核操作')
}

async function handleGetMyPosts(openid, data) {
  const user = await getUser(openid)
  await repairOrphanPosts(openid, user)
  const filter = { _openid: openid, visibility: 'public' }
  if (!hasExplicitPagination(data)) {
    const posts = await fetchAll(() =>
      db.collection('posts').where(filter).orderBy('publishedAt', 'desc'),
    )
    const list = posts.map(mapPostSummary)
    return ok({ list, page: 1, total: list.length, hasMore: false })
  }

  const { page, pageSize, skip } = getPagination(data)
  const [res, countRes] = await Promise.all([
    db.collection('posts')
      .where(filter)
      .orderBy('publishedAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('posts').where(filter).count(),
  ])
  const list = res.data.map(mapPostSummary)
  return ok({
    list,
    page,
    total: countRes.total,
    hasMore: skip + res.data.length < countRes.total,
  })
}

async function handleGetPendingPosts(openid, data) {
  const user = await getUser(openid)
  await repairOrphanPosts(openid, user)
  const filter = { _openid: openid, visibility: 'private' }
  if (!hasExplicitPagination(data)) {
    const posts = await fetchAll(() =>
      db.collection('posts').where(filter).orderBy('publishedAt', 'desc'),
    )
    const list = posts.map(mapPostSummary)
    return ok({ list, page: 1, total: list.length, hasMore: false })
  }

  const { page, pageSize, skip } = getPagination(data)
  const [res, countRes] = await Promise.all([
    db.collection('posts')
      .where(filter)
      .orderBy('publishedAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('posts').where(filter).count(),
  ])
  const list = res.data.map(mapPostSummary)
  return ok({
    list,
    page,
    total: countRes.total,
    hasMore: skip + res.data.length < countRes.total,
  })
}

async function handleGetMyLikes(openid, data) {
  const filter = { _openid: openid }
  if (!hasExplicitPagination(data)) {
    const likes = await fetchAll(() =>
      db.collection('likes').where(filter).orderBy('createdAt', 'desc'),
    )
    if (!likes.length) return ok({ list: [], page: 1, total: 0, hasMore: false })

    const ids = likes.map((item) => item.postId)
    const posts = await fetchPostsByIds(ids)
    const postMap = new Map(posts.map((post) => [post._id, post]))
    const list = likes
      .map((like) => {
        const post = postMap.get(like.postId)
        if (!post) return null
        return {
          ...mapPostSummary(post),
          liked: true,
          favorited: false,
          likedAt: like.createdAt,
        }
      })
      .filter(Boolean)
    return ok({
      list: await attachInteractionFlags(openid, list),
      page: 1,
      total: likes.length,
      hasMore: false,
    })
  }

  const { page, pageSize, skip } = getPagination(data)
  const [likes, countRes] = await Promise.all([
    db.collection('likes')
      .where(filter)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('likes').where(filter).count(),
  ])
  if (!likes.data.length) {
    return ok({ list: [], page, total: countRes.total, hasMore: false })
  }
  const ids = likes.data.map((item) => item.postId)
  const posts = await fetchPostsByIds(ids)
  const postMap = new Map(posts.map((post) => [post._id, post]))
  const list = likes.data
    .map((like) => {
      const post = postMap.get(like.postId)
      if (!post) return null
      return {
        ...mapPostSummary(post),
        liked: true,
        favorited: false,
        likedAt: like.createdAt,
      }
    })
    .filter(Boolean)
  return ok({
    list: await attachInteractionFlags(openid, list),
    page,
    total: countRes.total,
    hasMore: skip + likes.data.length < countRes.total,
  })
}

async function handleGetMyFavorites(openid, data) {
  const filter = { _openid: openid }
  if (!hasExplicitPagination(data)) {
    const favorites = await fetchAll(() =>
      db.collection('favorites').where(filter).orderBy('createdAt', 'desc'),
    )
    if (!favorites.length) return ok({ list: [], page: 1, total: 0, hasMore: false })

    const ids = favorites.map((item) => item.postId)
    const posts = await fetchPostsByIds(ids)
    const postMap = new Map(posts.map((post) => [post._id, post]))
    const list = favorites
      .map((favorite) => {
        const post = postMap.get(favorite.postId)
        if (!post) return null
        return { ...mapPostSummary(post), favorited: true, favoritedAt: favorite.createdAt }
      })
      .filter(Boolean)
    return ok({
      list: await attachInteractionFlags(openid, list),
      page: 1,
      total: favorites.length,
      hasMore: false,
    })
  }

  const { page, pageSize, skip } = getPagination(data)
  const [favorites, countRes] = await Promise.all([
    db.collection('favorites')
      .where(filter)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('favorites').where(filter).count(),
  ])
  if (!favorites.data.length) {
    return ok({ list: [], page, total: countRes.total, hasMore: false })
  }
  const ids = favorites.data.map((item) => item.postId)
  const posts = await fetchPostsByIds(ids)
  const postMap = new Map(posts.map((post) => [post._id, post]))
  const list = favorites.data
    .map((favorite) => {
      const post = postMap.get(favorite.postId)
      if (!post) return null
      return { ...mapPostSummary(post), favorited: true, favoritedAt: favorite.createdAt }
    })
    .filter(Boolean)
  return ok({
    list: await attachInteractionFlags(openid, list),
    page,
    total: countRes.total,
    hasMore: skip + favorites.data.length < countRes.total,
  })
}

async function handleGetBeanLogs(openid, data) {
  const filter = data?.filter || 'all'
  const res = await db.collection('bean_transactions').where({ _openid: openid }).orderBy('createdAt', 'desc').limit(50).get()
  let list = res.data
  if (filter === 'income') list = list.filter((item) => item.type === 'income')
  if (filter === 'expense') list = list.filter((item) => item.type === 'expense')
  return ok({ list })
}

async function handleSubmitFeedback(openid, data) {
  await db.collection('feedbacks').add({
    data: {
      _openid: openid,
      type: data.type,
      content: data.content,
      contact: data.contact || '',
      images: data.images || [],
      createdAt: db.serverDate(),
    },
  })
  return ok({ submitted: true })
}

async function handleGetCounts(openid) {
  const [pendingCount, postCount, likeCount, favoriteCount] = await Promise.all([
    db.collection('posts').where({ _openid: openid, visibility: 'private' }).count(),
    db.collection('posts').where({ _openid: openid, visibility: 'public' }).count(),
    db.collection('likes').where({ _openid: openid }).count(),
    db.collection('favorites').where({ _openid: openid }).count(),
  ])
  return ok({
    draftCount: pendingCount.total,
    postCount: postCount.total,
    likeCount: likeCount.total,
    favoriteCount: favoriteCount.total,
  })
}

exports.main = async (event) => {
  const { action, data = {} } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return fail('未获取到 openid')

  try {
    switch (action) {
      case 'login':
        return await handleLogin(openid, data)
      case 'getFeed':
        return await handleGetFeed(openid, data)
      case 'searchPosts':
        return await handleSearchPosts(openid, data)
      case 'getPost':
        return await handleGetPost(openid, data)
      case 'toggleLike':
        return await handleToggleLike(openid, data)
      case 'toggleFavorite':
        return await handleToggleFavorite(openid, data)
      case 'downloadPost':
        return await handleDownloadPost(openid, data)
      case 'saveDraft':
        return await handleSaveDraft(openid, data)
      case 'getDrafts':
        return await handleGetDrafts(openid)
      case 'getDraft':
        return await handleGetDraft(openid, data)
      case 'deleteDraft':
        return await handleDeleteDraft(openid, data)
      case 'publishPost':
        return await handlePublishPost(openid, data)
      case 'updatePostVisibility':
        return await handleUpdatePostVisibility(openid, data)
      case 'deletePost':
        return await handleDeletePost(openid, data)
      case 'getMyPosts':
        return await handleGetMyPosts(openid, data)
      case 'getPendingPosts':
        return await handleGetPendingPosts(openid, data)
      case 'getMyLikes':
        return await handleGetMyLikes(openid, data)
      case 'getMyFavorites':
        return await handleGetMyFavorites(openid, data)
      case 'getBeanLogs':
        return await handleGetBeanLogs(openid, data)
      case 'rewardShare':
        return await handleRewardShare(openid)
      case 'submitFeedback':
        return await handleSubmitFeedback(openid, data)
      case 'getCounts':
        return await handleCounts(openid)
      case 'checkAdmin':
        return await handleCheckAdmin(openid)
      case 'getReviewQueue':
        return await handleGetReviewQueue(openid)
      case 'getReviewAuthorPosts':
        return await handleGetReviewAuthorPosts(openid, data)
      case 'reviewPost':
        return await handleReviewPost(openid, data)
      default:
        return fail(`未知 action: ${action}`)
    }
  } catch (error) {
    console.error(error)
    return fail(error.message || '服务器错误')
  }
}

async function handleCounts(openid) {
  return handleGetCounts(openid)
}

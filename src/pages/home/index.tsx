import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh, useReachBottom, useLoad } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppTabBar from '@/components/AppTabBar'
import {
  fetchFeed,
  formatCount,
  searchPosts,
} from '@/services/communityService'
import heroBanner from '@/assets/home-hero-mascot.png'
import searchIcon from '@/assets/icons/search.svg'
import type { FeedTab, PostSummary } from '@/types/community'
import './index.scss'

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'recommend', label: '推荐' },
  { key: 'latest', label: '最新' },
]

function splitWaterfall(list: PostSummary[]): [PostSummary[], PostSummary[]] {
  const left: PostSummary[] = []
  const right: PostSummary[] = []
  list.forEach((item, index) => {
    if (index % 2 === 0) left.push(item)
    else right.push(item)
  })
  return [left, right]
}

function FeedCard({ item, onClick }: { item: PostSummary; onClick: () => void }) {
  return (
    <View className='home-page__card' onClick={onClick}>
      <View className='home-page__card-cover-wrap'>
        {item.coverUrl ? (
          <Image className='home-page__card-cover' src={item.coverUrl} mode='aspectFill' />
        ) : (
          <View className='home-page__card-cover home-page__card-cover--placeholder' />
        )}
        <Text className='home-page__card-size'>
          {item.width}x{item.height}
        </Text>
      </View>
      <View className='home-page__card-body'>
        <Text className='home-page__card-title'>{item.title}</Text>
        <View className='home-page__card-footer'>
          <View className='home-page__card-author'>
            {item.author.avatarUrl ? (
              <Image className='home-page__card-avatar' src={item.author.avatarUrl} />
            ) : (
              <View className='home-page__card-avatar home-page__card-avatar--placeholder' />
            )}
            <Text className='home-page__card-author-name'>{item.author.nickName}</Text>
          </View>
          <View className='home-page__card-like'>
            <Text className='home-page__card-like-icon'>♥</Text>
            <Text className='home-page__card-like-count'>{formatCount(item.likeCount)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export default function HomePage() {
  const [headerLayout, setHeaderLayout] = useState({ paddingTop: 48, headerRight: 96, rowHeight: 32 })

  useLoad((options) => {
    const inviterId = options?.inviterId as string | undefined
    if (inviterId) Taro.setStorageSync('inviterId', inviterId)
  })

  useEffect(() => {
    const windowInfo = Taro.getWindowInfo()
    const menu = Taro.getMenuButtonBoundingClientRect()
    setHeaderLayout({
      paddingTop: menu.top,
      headerRight: windowInfo.windowWidth - menu.left + 8,
      rowHeight: menu.height,
    })
  }, [])

  const [tab, setTab] = useState<FeedTab>('recommend')
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const isSearching = searchKeyword.length > 0
  const [leftCol, rightCol] = useMemo(() => splitWaterfall(posts), [posts])

  const loadFeed = useCallback(
    async (nextTab: FeedTab, nextPage: number, replace = false) => {
      if (loading) return
      setLoading(true)
      try {
        const result = await fetchFeed(nextTab, nextPage)
        setPosts((prev) => (replace ? result.list : [...prev, ...result.list]))
        setHasMore(result.hasMore)
        setPage(nextPage)
        setTab(nextTab)
      } catch (error) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        })
      } finally {
        setLoading(false)
        Taro.stopPullDownRefresh()
      }
    },
    [loading],
  )

  const loadSearch = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setSearchKeyword('')
      setPosts([])
      setPage(1)
      setHasMore(true)
      await loadFeed(tab, 1, true)
      return
    }
    setLoading(true)
    try {
      const list = await searchPosts(trimmed)
      setSearchKeyword(trimmed)
      setPosts(list)
      setHasMore(false)
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '搜索失败',
        icon: 'none',
      })
    } finally {
      setLoading(false)
    }
  }, [loadFeed, tab])

  useEffect(() => {
    loadFeed('recommend', 1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(() => {
    if (isSearching) {
      loadSearch(searchKeyword)
      return
    }
    loadFeed(tab, 1, true)
  })

  useReachBottom(() => {
    if (isSearching || !hasMore || loading) return
    void loadFeed(tab, page + 1)
  })

  const handleTabChange = (nextTab: FeedTab) => {
    if (nextTab === tab && !isSearching) return
    setSearchKeyword('')
    setKeyword('')
    loadFeed(nextTab, 1, true)
  }

  const openPost = (postId: string) => {
    Taro.navigateTo({ url: `/pages/post-detail/index?id=${postId}` })
  }

  const goGenerate = () => {
    Taro.reLaunch({ url: '/pages/generate/index' })
  }

  return (
    <View className='home-page'>
      <View
        className='home-page__header'
        style={{
          paddingTop: `${headerLayout.paddingTop}px`,
          paddingRight: `${headerLayout.headerRight}px`,
        }}
      >
        <View className='home-page__brand'>
          <View
            className='home-page__title-line'
            style={{ height: `${headerLayout.rowHeight}px` }}
          >
            <View className='home-page__title-row'>
              <Text className='home-page__title'>拼豆豆</Text>
              <Text className='home-page__heart'>♥</Text>
            </View>
          </View>
          <Text className='home-page__subtitle'>图片一键生成拼豆图纸</Text>
        </View>
        <View className='home-page__search'>
          <Image className='home-page__search-icon' src={searchIcon} mode='aspectFit' />
          <Input
            className='home-page__search-input'
            value={keyword}
            placeholder='搜索图纸、作者、标签'
            confirmType='search'
            onInput={(event) => setKeyword(event.detail.value)}
            onConfirm={() => loadSearch(keyword)}
          />
        </View>
      </View>

      <View className='home-page__hero' onClick={goGenerate}>
        <Image className='home-page__hero-bg' src={heroBanner} mode='widthFix' />
        <View className='home-page__hero-content'>
          <Text className='home-page__hero-line1'>上传图片 一键生成</Text>
          <Text className='home-page__hero-line2'>拼豆图纸</Text>
          <View className='home-page__hero-btn'>去生成 →</View>
        </View>
      </View>

      {!isSearching && (
        <View className='home-page__tabs'>
          {TABS.map((item) => (
            <View
              key={item.key}
              className={`home-page__tab${tab === item.key ? ' is-active' : ''}`}
              onClick={() => handleTabChange(item.key)}
            >
              <Text className='home-page__tab-text'>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      {isSearching ? (
        <View className='home-page__search-hint'>
          <Text>搜索「{searchKeyword}」</Text>
          <Text
            className='home-page__search-clear'
            onClick={() => {
              setKeyword('')
              setSearchKeyword('')
              loadFeed(tab, 1, true)
            }}
          >
            清除
          </Text>
        </View>
      ) : null}

      {posts.length === 0 && !loading ? (
        <View className='home-page__empty'>
          <Text>{isSearching ? '没有找到相关图纸' : '暂无作品，快去生成吧'}</Text>
        </View>
      ) : (
        <View className='home-page__waterfall'>
          <View className='home-page__column'>
            {leftCol.map((item) => (
              <FeedCard key={item._id} item={item} onClick={() => openPost(item._id)} />
            ))}
          </View>
          <View className='home-page__column'>
            {rightCol.map((item) => (
              <FeedCard key={item._id} item={item} onClick={() => openPost(item._id)} />
            ))}
          </View>
        </View>
      )}

      {loading ? <View className='home-page__loading'>加载中...</View> : null}
      {!loading && !hasMore && posts.length > 0 ? (
        <View className='home-page__footer-tip'>· 没有更多啦 ·</View>
      ) : null}

      <AppTabBar active='home' />
    </View>
  )
}

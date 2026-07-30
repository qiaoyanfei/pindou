import { View, Text, Input, Image, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh, useReachBottom, useLoad, useDidShow } from '@tarojs/taro'
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  fetchFeed,
  fetchFinishedProductFeed,
  formatCount,
  getCachedUser,
  searchPosts,
  buildPostDetailUrl,
  buildPostDetailForPreview,
  CATEGORY_OPTIONS,
} from '@/services/communityService'
import { isUserAuthenticated } from '@/services/wechatAuth'
import { buildLoginUrl } from '@/utils/authRoute'
import { restoreSessionFromStorage } from '@/services/session'
import { safeNavigateTo, redirectToGeneratePage } from '@/utils/navigation'
import { TAB_INDEX, updateTabBarSelected } from '@/utils/tabBar'
import heroBanner from '@/assets/home-hero-mascot.jpg'
import searchIcon from '@/assets/icons/search.svg'
import { MINI_PROGRAM_NAME } from '@/utils/constants'
import { useShareContent } from '@/utils/shareReward'
import type { FeedTab, FinishedProductSummary, HomeTab, PostCategory, PostSummary } from '@/types/community'
import {
  applyPatchesToPosts,
  patchPostInList,
  POST_INTERACTION_EVENT,
  type PostInteractionPatch,
} from '@/utils/postInteractionSync'
import {
  hasHomeFeedCache,
  readHomeFeedCache,
  writeHomeFeedCache,
} from '@/utils/homeFeedCache'
import { cachePostDetail } from '@/utils/postDetailCache'
import { cacheFinishedProduct } from '@/utils/finishedProductCache'
import {
  applyPatchesToFinishedProducts,
  FINISHED_PRODUCT_INTERACTION_EVENT,
  patchFinishedProductInList,
  type FinishedProductInteractionPatch,
} from '@/utils/finishedProductInteractionSync'
import './index.scss'

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'recommend', label: '推荐' },
  { key: 'latest', label: '最新' },
  { key: 'finished', label: '成品' },
]

const CATEGORY_FILTERS: { key: PostCategory | ''; label: string }[] = [
  { key: '', label: '全部' },
  ...CATEGORY_OPTIONS.map((item) => ({ key: item, label: item })),
]

interface SearchState {
  keyword: string
  category: PostCategory | ''
  results: PostSummary[]
  page: number
  hasMore: boolean
  loading: boolean
}

const EMPTY_SEARCH_STATE: SearchState = {
  keyword: '',
  category: '',
  results: [],
  page: 1,
  hasMore: false,
  loading: false,
}

function getHeaderLayout() {
  try {
    const windowInfo = Taro.getWindowInfo()
    const menu = Taro.getMenuButtonBoundingClientRect()
    return {
      paddingTop: menu.top,
      headerRight: windowInfo.windowWidth - menu.left + 8,
      rowHeight: menu.height,
    }
  } catch {
    return { paddingTop: 48, headerRight: 96, rowHeight: 32 }
  }
}

interface HeaderLayout {
  paddingTop: number
  headerRight: number
  rowHeight: number
}

function splitWaterfall(list: PostSummary[]): [PostSummary[], PostSummary[]] {
  const left: PostSummary[] = []
  const right: PostSummary[] = []
  list.forEach((item, index) => {
    if (index % 2 === 0) left.push(item)
    else right.push(item)
  })
  return [left, right]
}

function splitFinishedWaterfall(list: FinishedProductSummary[]): [FinishedProductSummary[], FinishedProductSummary[]] {
  const left: FinishedProductSummary[] = []
  const right: FinishedProductSummary[] = []
  list.forEach((item, index) => {
    if (index % 2 === 0) left.push(item)
    else right.push(item)
  })
  return [left, right]
}

function getCoverAspectPadding(item: PostSummary): string {
  if (item.width > 0 && item.height > 0) {
    return `${(item.height / item.width) * 100}%`
  }
  return '100%'
}

function filterPostsByCategory(list: PostSummary[], category: PostCategory | ''): PostSummary[] {
  if (!category) return list
  return list.filter((item) => item.category === category)
}

const FeedCard = memo(function FeedCard({ item, onClick }: { item: PostSummary; onClick: () => void }) {
  const coverAspectPadding = getCoverAspectPadding(item)

  return (
    <View className='home-page__card' onClick={onClick}>
      <View
        className='home-page__card-cover-wrap'
        style={{ paddingTop: coverAspectPadding }}
      >
        {item.coverUrl ? (
          <Image className='home-page__card-cover' src={item.coverUrl} mode='aspectFit' showMenuByLongpress={false} lazyLoad />
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
              <Image className='home-page__card-avatar' src={item.author.avatarUrl} lazyLoad />
            ) : (
              <View className='home-page__card-avatar home-page__card-avatar--placeholder' />
            )}
            <Text className='home-page__card-author-name'>{item.author.nickName}</Text>
          </View>
          <View className={`home-page__card-like${item.liked ? ' is-liked' : ''}`}>
            <Text className='home-page__card-like-icon'>♥</Text>
            <Text className='home-page__card-like-count'>{formatCount(item.likeCount)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
})

const WaterfallView = memo(function WaterfallView({
  list,
  onOpenPost,
}: {
  list: PostSummary[]
  onOpenPost: (item: PostSummary) => void
}) {
  const [leftCol, rightCol] = useMemo(() => splitWaterfall(list), [list])

  return (
    <View className='home-page__waterfall'>
      <View className='home-page__column'>
        {leftCol.map((item) => (
          <FeedCard key={item._id} item={item} onClick={() => onOpenPost(item)} />
        ))}
      </View>
      <View className='home-page__column'>
        {rightCol.map((item) => (
          <FeedCard key={item._id} item={item} onClick={() => onOpenPost(item)} />
        ))}
      </View>
    </View>
  )
})

const FinishedFeedCard = memo(function FinishedFeedCard({
  item,
  onClick,
}: {
  item: FinishedProductSummary
  onClick: () => void
}) {
  return (
    <View className='home-page__card' onClick={onClick}>
      <View className='home-page__card-cover-wrap' style={{ paddingTop: '100%' }}>
        {item.coverUrl ? (
          <Image className='home-page__card-cover' src={item.coverUrl} mode='aspectFill' showMenuByLongpress={false} lazyLoad />
        ) : (
          <View className='home-page__card-cover home-page__card-cover--placeholder' />
        )}
        <Text className='home-page__card-size'>成品</Text>
      </View>
      <View className='home-page__card-body'>
        <Text className='home-page__card-title'>{item.title}</Text>
        <View className='home-page__card-footer'>
          <View className='home-page__card-author'>
            {item.author.avatarUrl ? (
              <Image className='home-page__card-avatar' src={item.author.avatarUrl} lazyLoad />
            ) : (
              <View className='home-page__card-avatar home-page__card-avatar--placeholder' />
            )}
            <Text className='home-page__card-author-name'>{item.author.nickName}</Text>
          </View>
          <View className={`home-page__card-like${item.liked ? ' is-liked' : ''}`}>
            <Text className='home-page__card-like-icon'>♥</Text>
            <Text className='home-page__card-like-count'>{formatCount(item.likeCount)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
})

const FinishedWaterfallView = memo(function FinishedWaterfallView({
  list,
  onOpen,
}: {
  list: FinishedProductSummary[]
  onOpen: (item: FinishedProductSummary) => void
}) {
  const [leftCol, rightCol] = useMemo(() => splitFinishedWaterfall(list), [list])

  return (
    <View className='home-page__waterfall'>
      <View className='home-page__column'>
        {leftCol.map((item) => (
          <FinishedFeedCard key={item._id} item={item} onClick={() => onOpen(item)} />
        ))}
      </View>
      <View className='home-page__column'>
        {rightCol.map((item) => (
          <FinishedFeedCard key={item._id} item={item} onClick={() => onOpen(item)} />
        ))}
      </View>
    </View>
  )
})

const HomeHero = memo(function HomeHero({ onClick }: { onClick: () => void }) {
  return (
    <View className='home-page__hero' onClick={onClick}>
      <Image className='home-page__hero-bg' src={heroBanner} mode='aspectFill' />
      <View className='home-page__hero-content'>
        <Text className='home-page__hero-line1'>上传图片 一键生成</Text>
        <Text className='home-page__hero-line2'>拼豆图纸</Text>
        <View className='home-page__hero-btn'>去生成 →</View>
      </View>
    </View>
  )
})

const HomeBrand = memo(function HomeBrand({ layout }: { layout: HeaderLayout }) {
  return (
    <View className='home-page__brand'>
      <View
        className='home-page__title-line'
        style={{ height: `${layout.rowHeight}px` }}
      >
        <View className='home-page__title-row'>
          <Text className='home-page__title'>happy拼豆嘛</Text>
          <Text className='home-page__heart'>♥</Text>
        </View>
      </View>
      <Text className='home-page__subtitle'>图片一键生成拼豆图纸</Text>
    </View>
  )
})

interface HomeSearchBoxHandle {
  clear: () => void
}

const HomeSearchBox = memo(forwardRef<HomeSearchBoxHandle, {
  onSearch: (value: string) => void
}>(function HomeSearchBox({ onSearch }, ref) {
  const [value, setValue] = useState('')

  useImperativeHandle(ref, () => ({
    clear: () => setValue(''),
  }), [])

  return (
    <View className='home-page__search'>
      <Image className='home-page__search-icon' src={searchIcon} mode='aspectFit' />
      <Input
        className='home-page__search-input'
        placeholderClass='home-page__search-input-placeholder'
        placeholderStyle='font-size:30rpx;line-height:80rpx;color:#9ca3af'
        value={value}
        placeholder='搜索图纸、作者、标签'
        confirmType='search'
        onInput={(event) => setValue(event.detail.value)}
        onConfirm={() => onSearch(value)}
      />
    </View>
  )
}))

const HomeStaticHeader = memo(function HomeStaticHeader({
  layout,
  onGenerate,
}: {
  layout: HeaderLayout
  onGenerate: () => void
}) {
  return (
    <>
      <View
        className='home-page__header'
        style={{
          paddingTop: `${layout.paddingTop}px`,
          paddingRight: `${layout.headerRight}px`,
        }}
      >
        <HomeBrand layout={layout} />
      </View>

      <HomeHero onClick={onGenerate} />
    </>
  )
})

const HomeModeBar = memo(function HomeModeBar({
  isSearching,
  searchKeyword,
  searchCategory,
  tab,
  onTabChange,
  onClearSearch,
}: {
  isSearching: boolean
  searchKeyword: string
  searchCategory: PostCategory | ''
  tab: HomeTab
  onTabChange: (nextTab: HomeTab) => void
  onClearSearch: () => void
}) {
  const searchLabel = [
    searchKeyword ? `搜索「${searchKeyword}」` : '',
    searchCategory ? `分类「${searchCategory}」` : '',
  ].filter(Boolean).join(' · ')

  return (
    <View className='home-page__mode-bar'>
      <View className={`home-page__tabs${isSearching ? ' is-hidden' : ''}`}>
        {TABS.map((item) => (
          <View
            key={item.key}
            className={`home-page__tab${tab === item.key ? ' is-active' : ''}`}
            onClick={() => onTabChange(item.key)}
          >
            <Text className='home-page__tab-text'>{item.label}</Text>
          </View>
        ))}
      </View>

      <View className={`home-page__search-hint${isSearching ? '' : ' is-hidden'}`}>
        <Text>{searchLabel}</Text>
        <Text
          className='home-page__search-clear'
          onClick={onClearSearch}
        >
          清除
        </Text>
      </View>
    </View>
  )
})

const HomeStickyControls = memo(function HomeStickyControls({
  layout,
  onSearch,
  selectedCategory,
  onCategoryChange,
  onFinishedCategoryChange,
  onTabChange,
  onClearSearch,
  onGenerate,
}: {
  layout: HeaderLayout
  onSearch: (value: string, category: PostCategory | '') => void
  selectedCategory: PostCategory | ''
  onCategoryChange: (category: PostCategory | '') => void
  onFinishedCategoryChange: (category: PostCategory | '', keyword?: string) => void
  onTabChange: (nextTab: HomeTab) => void
  onClearSearch: () => void
  onGenerate: () => void
}) {
  const searchBoxRef = useRef<HomeSearchBoxHandle>(null)
  const [displayTab, setDisplayTab] = useState<HomeTab>('recommend')
  const [displaySearchKeyword, setDisplaySearchKeyword] = useState('')
  // 成品 Tab：有关键词时进入搜索提示条；仅分类筛选时仍显示 Tab
  const isSearching = displaySearchKeyword.length > 0
    || (displayTab !== 'finished' && Boolean(selectedCategory))
  const stickyTop = layout.paddingTop + layout.rowHeight + 8

  const handleSearch = useCallback((value: string) => {
    const trimmed = value.trim()
    if (displayTab === 'finished') {
      if (!trimmed && !selectedCategory) {
        searchBoxRef.current?.clear()
        setDisplaySearchKeyword('')
        onClearSearch()
        return
      }
      setDisplaySearchKeyword(trimmed)
      onSearch(trimmed, selectedCategory)
      return
    }
    if (!trimmed && !selectedCategory) {
      searchBoxRef.current?.clear()
      setDisplaySearchKeyword('')
      onClearSearch()
      return
    }
    setDisplaySearchKeyword(trimmed)
    onSearch(trimmed, selectedCategory)
  }, [displayTab, onClearSearch, onSearch, selectedCategory])

  const handleCategoryChange = useCallback((category: PostCategory | '') => {
    onCategoryChange(category)
    if (displayTab === 'finished') {
      onFinishedCategoryChange(category, displaySearchKeyword)
      return
    }
    if (displaySearchKeyword || category) {
      onSearch(displaySearchKeyword, category)
      return
    }
    onClearSearch()
  }, [
    displaySearchKeyword,
    displayTab,
    onCategoryChange,
    onClearSearch,
    onFinishedCategoryChange,
    onSearch,
  ])

  const handleTabChange = useCallback((nextTab: HomeTab) => {
    if (nextTab === displayTab && !isSearching) return
    searchBoxRef.current?.clear()
    setDisplaySearchKeyword('')
    onCategoryChange('')
    setDisplayTab(nextTab)
    onTabChange(nextTab)
  }, [displayTab, isSearching, onCategoryChange, onTabChange])

  const handleClearSearch = useCallback(() => {
    searchBoxRef.current?.clear()
    setDisplaySearchKeyword('')
    onClearSearch()
  }, [onClearSearch])

  return (
    <>
      <HomeStaticHeader
        layout={layout}
        onGenerate={onGenerate}
      />

      <View className='home-page__sticky-controls' style={{ top: `${stickyTop}px` }}>
        <HomeSearchBox ref={searchBoxRef} onSearch={handleSearch} />

        <ScrollView
          className='home-page__category-scroll'
          scrollX
          enhanced
          showScrollbar={false}
        >
          <View className='home-page__category-list'>
            {CATEGORY_FILTERS.map((item) => (
              <View
                key={item.key || 'all'}
                className={`home-page__category-chip${selectedCategory === item.key ? ' is-active' : ''}`}
                onClick={() => handleCategoryChange(item.key)}
              >
                <Text>{item.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <HomeModeBar
          isSearching={isSearching}
          searchKeyword={displaySearchKeyword}
          searchCategory={selectedCategory}
          tab={displayTab}
          onTabChange={handleTabChange}
          onClearSearch={handleClearSearch}
        />
      </View>
    </>
  )
})

export default function HomePage() {
  const [headerLayout, setHeaderLayout] = useState(getHeaderLayout)
  const inflightRef = useRef<Partial<Record<FeedTab, boolean>>>({})
  const finishedInflightRef = useRef(false)

  useShareContent(() => ({
    title: `${MINI_PROGRAM_NAME}，图片一键生成拼豆图纸`,
    path: '/pages/home/index',
  }))

  useLoad((options) => {
    const inviterId = options?.inviterId as string | undefined
    if (inviterId) Taro.setStorageSync('inviterId', inviterId)
  })

  useEffect(() => {
    const nextLayout = getHeaderLayout()
    setHeaderLayout((prev) => {
      if (
        prev.paddingTop === nextLayout.paddingTop
        && prev.headerRight === nextLayout.headerRight
        && prev.rowHeight === nextLayout.rowHeight
      ) {
        return prev
      }
      return nextLayout
    })
  }, [])

  const [tab, setTab] = useState<HomeTab>('recommend')
  const [feeds, setFeeds] = useState(readHomeFeedCache)
  const feedsRef = useRef(feeds)
  const [finishedFeed, setFinishedFeed] = useState<{
    list: FinishedProductSummary[]
    page: number
    hasMore: boolean
    category: PostCategory | ''
    keyword: string
  }>({ list: [], page: 1, hasMore: true, category: '', keyword: '' })
  const finishedFeedRef = useRef(finishedFeed)
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH_STATE)
  const [selectedCategory, setSelectedCategory] = useState<PostCategory | ''>('')
  const [loadingTab, setLoadingTab] = useState<HomeTab | null>(null)
  const runtimeRef = useRef({
    tab: 'recommend' as HomeTab,
    searchKeyword: '',
    searchCategory: '' as PostCategory | '',
    isSearching: false,
    hasMore: false,
    loadingTab: null as HomeTab | null,
    page: 1,
    searchPage: 1,
    finishedCategory: '' as PostCategory | '',
    finishedKeyword: '',
  })

  const searchKeyword = searchState.keyword
  const searchCategory = searchState.category
  const searchResults = searchState.results
  const searchPage = searchState.page
  const searchHasMore = searchState.hasMore
  const searching = searchState.loading
  const isSearching = searchKeyword.length > 0 || Boolean(searchCategory)
  const isFinishedTab = tab === 'finished'
  const isFinishedSearching = isFinishedTab && finishedFeed.keyword.length > 0
  const currentFeed = tab === 'finished'
    ? { posts: [], page: finishedFeed.page, hasMore: finishedFeed.hasMore }
    : feeds[tab]
  const posts = isSearching && !isFinishedTab ? searchResults : currentFeed.posts
  const finishedList = finishedFeed.list
  const hasMore = isSearching && !isFinishedTab
    ? searchHasMore
    : (tab === 'finished' ? finishedFeed.hasMore : currentFeed.hasMore)
  const page = isSearching && !isFinishedTab
    ? searchPage
    : (tab === 'finished' ? finishedFeed.page : currentFeed.page)
  feedsRef.current = feeds
  finishedFeedRef.current = finishedFeed
  runtimeRef.current = {
    tab,
    searchKeyword,
    searchCategory,
    isSearching: isSearching && !isFinishedTab,
    hasMore,
    loadingTab,
    page,
    searchPage,
    finishedCategory: finishedFeed.category,
    finishedKeyword: finishedFeed.keyword,
  }
  const showInitialLoading = !(isSearching && !isFinishedTab)
    && (isFinishedTab ? finishedList.length === 0 : posts.length === 0)
    && loadingTab === tab
  const isLoadingMore = (isSearching && !isFinishedTab && searching && posts.length > 0)
    || (!(isSearching && !isFinishedTab) && loadingTab === tab && (
      isFinishedTab ? finishedList.length > 0 : posts.length > 0
    ))

  const updateFeeds = useCallback((
    updater: (prev: ReturnType<typeof readHomeFeedCache>) => ReturnType<typeof readHomeFeedCache>,
  ) => {
    setFeeds((prev) => {
      const next = updater(prev)
      if (next !== prev) {
        writeHomeFeedCache(next)
      }
      return next
    })
  }, [])

  const loadFeed = useCallback(async (nextTab: FeedTab, nextPage: number, replace = false) => {
    if (inflightRef.current[nextTab]) return

    const hasCachedPosts = hasHomeFeedCache(nextTab)
    inflightRef.current[nextTab] = true
    if (!replace || !hasCachedPosts) {
      setLoadingTab(nextTab)
    }
    try {
      const result = await fetchFeed(nextTab, nextPage)
      updateFeeds((prev) => ({
        ...prev,
        [nextTab]: {
          posts: replace ? result.list : [...prev[nextTab].posts, ...result.list],
          page: nextPage,
          hasMore: result.hasMore,
        },
      }))
    } catch (error) {
      if (!hasCachedPosts) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        })
      }
    } finally {
      inflightRef.current[nextTab] = false
      setLoadingTab((current) => (current === nextTab ? null : current))
      Taro.stopPullDownRefresh()
    }
  }, [updateFeeds])

  const loadFinishedFeed = useCallback(async (
    nextPage: number,
    replace = false,
    category: PostCategory | '' = finishedFeedRef.current.category,
    keyword: string = finishedFeedRef.current.keyword,
  ) => {
    if (finishedInflightRef.current) return
    finishedInflightRef.current = true
    const trimmedKeyword = keyword.trim()
    if (!replace || finishedFeedRef.current.list.length === 0) {
      setLoadingTab('finished')
    }
    try {
      const result = await fetchFinishedProductFeed(nextPage, category, trimmedKeyword)
      setFinishedFeed({
        list: replace ? result.list : [...finishedFeedRef.current.list, ...result.list],
        page: nextPage,
        hasMore: result.hasMore,
        category,
        keyword: trimmedKeyword,
      })
    } catch (error) {
      if (finishedFeedRef.current.list.length === 0) {
        Taro.showToast({
          title: error instanceof Error ? error.message : '加载失败',
          icon: 'none',
        })
      }
    } finally {
      finishedInflightRef.current = false
      setLoadingTab((current) => (current === 'finished' ? null : current))
      Taro.stopPullDownRefresh()
    }
  }, [])

  const handleFinishedCategoryChange = useCallback((
    category: PostCategory | '',
    keyword?: string,
  ) => {
    setSelectedCategory(category)
    void loadFinishedFeed(
      1,
      true,
      category,
      keyword === undefined ? finishedFeedRef.current.keyword : keyword,
    )
  }, [loadFinishedFeed])

  const loadSearch = useCallback(async (
    value: string,
    category: PostCategory | '' = '',
    options?: { page?: number; silent?: boolean; append?: boolean },
  ) => {
    const trimmed = value.trim()
    if (!trimmed && !category) {
      setSearchState(EMPTY_SEARCH_STATE)
      setSelectedCategory('')
      const currentTab = runtimeRef.current.tab
      if (feedsRef.current[currentTab].posts.length === 0) {
        await loadFeed(currentTab, 1, true)
      }
      return
    }

    const silent = options?.silent ?? false
    const nextPage = options?.page ?? 1
    const append = options?.append ?? false
    const canUseLocalCategoryResults = !append && nextPage === 1 && !trimmed && Boolean(category)
    const localCategoryResults = canUseLocalCategoryResults
      ? filterPostsByCategory(feedsRef.current[runtimeRef.current.tab].posts, category)
      : []
    if (!silent) {
      setSearchState((prev) => ({
        keyword: trimmed,
        category,
        results: append ? prev.results : applyPatchesToPosts(localCategoryResults),
        page: nextPage,
        hasMore: append ? prev.hasMore : false,
        loading: true,
      }))
    }
    try {
      const result = await searchPosts(trimmed, nextPage, category)
      const filteredList = filterPostsByCategory(result.list, category)
      const nextList = canUseLocalCategoryResults && filteredList.length === 0 && localCategoryResults.length > 0
        ? localCategoryResults
        : filteredList
      setSearchState((prev) => ({
        keyword: trimmed,
        category,
        results: applyPatchesToPosts(append
          ? [...prev.results, ...nextList]
          : nextList),
        page: nextPage,
        hasMore: result.hasMore && nextList.length > 0,
        loading: false,
      }))
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '搜索失败',
        icon: 'none',
      })
      if (!silent) {
        setSearchState((prev) => ({ ...prev, loading: false }))
      }
    } finally {
      Taro.stopPullDownRefresh()
    }
  }, [loadFeed])

  const handleHomeSearch = useCallback((value: string, category: PostCategory | '' = '') => {
    if (runtimeRef.current.tab === 'finished') {
      setSelectedCategory(category)
      void loadFinishedFeed(1, true, category, value)
      return
    }
    void loadSearch(value, category)
  }, [loadFinishedFeed, loadSearch])

  useEffect(() => {
    if (!hasHomeFeedCache('recommend')) {
      void loadFeed('recommend', 1, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onInteractionChange = (patch: PostInteractionPatch) => {
      updateFeeds((prev) => {
        const recommendPosts = patchPostInList(prev.recommend.posts, patch)
        const latestPosts = patchPostInList(prev.latest.posts, patch)
        if (
          recommendPosts === prev.recommend.posts
          && latestPosts === prev.latest.posts
        ) {
          return prev
        }
        return {
          recommend: {
            ...prev.recommend,
            posts: recommendPosts,
          },
          latest: {
            ...prev.latest,
            posts: latestPosts,
          },
        }
      })
      setSearchState((prev) => {
        const results = patchPostInList(prev.results, patch)
        return results === prev.results ? prev : { ...prev, results }
      })
    }

    const onFinishedInteractionChange = (patch: FinishedProductInteractionPatch) => {
      setFinishedFeed((prev) => {
        const list = patchFinishedProductInList(prev.list, patch)
        return list === prev.list ? prev : { ...prev, list }
      })
    }

    Taro.eventCenter.on(POST_INTERACTION_EVENT, onInteractionChange)
    Taro.eventCenter.on(FINISHED_PRODUCT_INTERACTION_EVENT, onFinishedInteractionChange)
    return () => {
      Taro.eventCenter.off(POST_INTERACTION_EVENT, onInteractionChange)
      Taro.eventCenter.off(FINISHED_PRODUCT_INTERACTION_EVENT, onFinishedInteractionChange)
    }
  }, [updateFeeds])

  useDidShow(() => {
    updateTabBarSelected(TAB_INDEX.home)
    updateFeeds((prev) => {
      const recommendPosts = applyPatchesToPosts(prev.recommend.posts)
      const latestPosts = applyPatchesToPosts(prev.latest.posts)
      if (
        recommendPosts === prev.recommend.posts
        && latestPosts === prev.latest.posts
      ) {
        return prev
      }
      return {
        recommend: {
          ...prev.recommend,
          posts: recommendPosts,
        },
        latest: {
          ...prev.latest,
          posts: latestPosts,
        },
      }
    })
    setSearchState((prev) => {
      const results = applyPatchesToPosts(prev.results)
      return results === prev.results ? prev : { ...prev, results }
    })
    setFinishedFeed((prev) => {
      const list = applyPatchesToFinishedProducts(prev.list)
      return list === prev.list ? prev : { ...prev, list }
    })
  })

  usePullDownRefresh(() => {
    const {
      isSearching: searchingNow,
      searchKeyword: keywordNow,
      searchCategory: categoryNow,
      tab: currentTab,
      finishedCategory,
      finishedKeyword,
    } = runtimeRef.current
    if (searchingNow) {
      void loadSearch(keywordNow, categoryNow, { page: 1, silent: true })
      return
    }
    if (currentTab === 'finished') {
      void loadFinishedFeed(1, true, finishedCategory, finishedKeyword)
      return
    }
    void loadFeed(currentTab, 1, true)
  })

  useReachBottom(() => {
    const {
      isSearching: searchingNow,
      tab: currentTab,
      hasMore: canLoadMore,
      loadingTab: loadingNow,
      page: currentPage,
      finishedCategory,
      finishedKeyword,
    } = runtimeRef.current
    if (searchingNow) {
      if (!canLoadMore || searching) return
      void loadSearch(
        runtimeRef.current.searchKeyword,
        runtimeRef.current.searchCategory,
        {
          page: runtimeRef.current.searchPage + 1,
          append: true,
        },
      )
      return
    }
    if (!canLoadMore || loadingNow === currentTab) return
    if (currentTab === 'finished') {
      void loadFinishedFeed(currentPage + 1, false, finishedCategory, finishedKeyword)
      return
    }
    void loadFeed(currentTab, currentPage + 1)
  })

  const handleTabChange = useCallback((nextTab: HomeTab) => {
    const { tab: currentTab, isSearching: searchingNow } = runtimeRef.current
    if (nextTab === currentTab && !searchingNow && !runtimeRef.current.finishedKeyword) return
    setSearchState(EMPTY_SEARCH_STATE)
    setSelectedCategory('')
    setTab(nextTab)
    if (nextTab === 'finished') {
      void loadFinishedFeed(1, true, '', '')
      return
    }
    if (feedsRef.current[nextTab].posts.length === 0) {
      void loadFeed(nextTab, 1, true)
    }
  }, [loadFeed, loadFinishedFeed])

  const clearSearch = useCallback(() => {
    setSearchState(EMPTY_SEARCH_STATE)
    setSelectedCategory('')
    if (runtimeRef.current.tab === 'finished') {
      void loadFinishedFeed(1, true, '', '')
    }
  }, [loadFinishedFeed])

  const openPost = useCallback((item: PostSummary) => {
    restoreSessionFromStorage()
    cachePostDetail(buildPostDetailForPreview(item))
    Taro.navigateTo({ url: buildPostDetailUrl(item._id, item.author?.openid, item.visibility) })
  }, [])

  const openFinishedProduct = useCallback((item: FinishedProductSummary) => {
    cacheFinishedProduct(item)
    Taro.navigateTo({ url: `/pages/finished-product-detail/index?id=${item._id}` })
  }, [])

  const goGenerate = useCallback(() => {
    restoreSessionFromStorage()
    if (!isUserAuthenticated(getCachedUser())) {
      safeNavigateTo(buildLoginUrl('/pages/generate/index'))
      return
    }
    redirectToGeneratePage(false)
  }, [])

  const emptyText = showInitialLoading || (searching && !isFinishedTab)
    ? '加载中...'
    : isFinishedTab
      ? (
        isFinishedSearching
          ? '没有找到相关成品'
          : (selectedCategory ? `暂无「${selectedCategory}」成品` : '暂无成品，敬请期待')
      )
      : isSearching
        ? '没有找到相关图纸'
        : '暂无作品，快去生成吧'

  return (
    <View className='home-page'>
      <HomeStickyControls
        layout={headerLayout}
        onSearch={handleHomeSearch}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        onFinishedCategoryChange={handleFinishedCategoryChange}
        onTabChange={handleTabChange}
        onClearSearch={clearSearch}
        onGenerate={goGenerate}
      />

      {isFinishedTab ? (
        finishedList.length === 0 ? (
          <View className='home-page__empty'>
            <Text>{emptyText}</Text>
          </View>
        ) : (
          <FinishedWaterfallView list={finishedList} onOpen={openFinishedProduct} />
        )
      ) : posts.length === 0 ? (
        <View className='home-page__empty'>
          <Text>{emptyText}</Text>
        </View>
      ) : (
        <WaterfallView list={posts} onOpenPost={openPost} />
      )}

      {isLoadingMore ? (
        <View className='home-page__footer-tip'>加载更多...</View>
      ) : null}

      {!showInitialLoading && !(searching && !isFinishedTab) && !isLoadingMore && !hasMore
        && (isFinishedTab ? finishedList.length > 0 : posts.length > 0) ? (
        <View className='home-page__footer-tip'>· 没有更多啦 ·</View>
      ) : null}
    </View>
  )
}

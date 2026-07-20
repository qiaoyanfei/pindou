import { View, Text, Image, Button, Input, Textarea, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useCallback, useRef, useState } from 'react'
import {
  checkIsAdmin,
  createFinishedProduct,
  deleteFinishedProduct,
  fetchFinishedProduct,
  fetchFinishedProductFeed,
  searchPosts,
  searchUsersByNickName,
  updateFinishedProduct,
  type AuthorSearchItem,
} from '@/services/communityService'
import { uploadCloudFile } from '@/services/cloudClient'
import { requireAuthenticated } from '@/services/session'
import { useDefaultPageShare } from '@/utils/shareReward'
import { cacheFinishedProduct } from '@/utils/finishedProductCache'
import type { FinishedProductSummary, PostSummary } from '@/types/community'
import './index.scss'

type PageMode = 'list' | 'form'

export default function AdminUploadFinishedPage() {
  const router = useRouter()
  const editId = String(router.params.id || '').trim()
  const initialMode: PageMode = editId || router.params.mode === 'upload' ? 'form' : 'list'

  useDefaultPageShare({ title: '管理用户成品', path: '/pages/home/index' })

  const adminCheckedRef = useRef(false)
  const isAdminRef = useRef(false)
  const editLoadedRef = useRef('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState<PageMode>(initialMode)
  const [editingId, setEditingId] = useState(editId)

  const [list, setList] = useState<FinishedProductSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [listHasMore, setListHasMore] = useState(true)

  const [imagePath, setImagePath] = useState('')
  const [existingCoverFileId, setExistingCoverFileId] = useState('')
  const [imageChanged, setImageChanged] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [postKeyword, setPostKeyword] = useState('')
  const [authorKeyword, setAuthorKeyword] = useState('')
  const [searchingPosts, setSearchingPosts] = useState(false)
  const [searchingAuthors, setSearchingAuthors] = useState(false)
  const [postResults, setPostResults] = useState<PostSummary[]>([])
  const [authorResults, setAuthorResults] = useState<AuthorSearchItem[]>([])
  const [selectedPost, setSelectedPost] = useState<PostSummary | null>(null)
  const [selectedAuthor, setSelectedAuthor] = useState<AuthorSearchItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState('')

  const ensureAdmin = useCallback(async () => {
    if (adminCheckedRef.current) return isAdminRef.current
    const result = await checkIsAdmin()
    adminCheckedRef.current = true
    isAdminRef.current = result.isAdmin
    setIsAdmin(result.isAdmin)
    return result.isAdmin
  }, [])

  const resetForm = useCallback(() => {
    setImagePath('')
    setExistingCoverFileId('')
    setImageChanged(false)
    setTitle('')
    setDescription('')
    setPostKeyword('')
    setAuthorKeyword('')
    setPostResults([])
    setAuthorResults([])
    setSelectedPost(null)
    setSelectedAuthor(null)
    setEditingId('')
    editLoadedRef.current = ''
  }, [])

  const loadList = useCallback(async (page = 1, append = false) => {
    setListLoading(true)
    try {
      const result = await fetchFinishedProductFeed(page)
      setList((prev) => (append ? [...prev, ...result.list] : result.list))
      setListPage(page)
      setListHasMore(result.hasMore)
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
    } finally {
      setListLoading(false)
    }
  }, [])

  const openCreateForm = () => {
    resetForm()
    setMode('form')
    Taro.setNavigationBarTitle({ title: '上传用户成品' })
  }

  const openEditForm = async (productId: string) => {
    resetForm()
    setEditingId(productId)
    setMode('form')
    Taro.setNavigationBarTitle({ title: '编辑用户成品' })
    try {
      const product = await fetchFinishedProduct(productId)
      editLoadedRef.current = productId
      setTitle(product.title || '')
      setDescription(product.description || '')
      setImagePath(product.coverUrl || '')
      setExistingCoverFileId(product.coverFileId || '')
      setImageChanged(false)
      setSelectedPost({
        _id: product.postId,
        title: product.postTitle || '关联图纸',
        category: '人物',
        width: 0,
        height: 0,
        styleMode: 'manga',
        paletteId: '',
        likeCount: 0,
        favoriteCount: 0,
        downloadCount: 0,
        author: product.author,
        createdAt: product.createdAt,
        coverUrl: '',
      })
      if (product.author?.openid) {
        setSelectedAuthor({
          openid: product.author.openid,
          nickName: product.author.nickName,
          avatarUrl: product.author.avatarUrl || '',
        })
        setAuthorKeyword(product.author.nickName || '')
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      })
      setMode('list')
      Taro.setNavigationBarTitle({ title: '管理用户成品' })
    }
  }

  const backToList = useCallback(() => {
    resetForm()
    setMode('list')
    Taro.setNavigationBarTitle({ title: '管理用户成品' })
    void loadList(1, false)
  }, [loadList, resetForm])

  useDidShow(() => {
    void (async () => {
      setChecking(true)
      try {
        const user = await requireAuthenticated('/pages/feedback/index')
        if (!user) return
        const allowed = await ensureAdmin()
        if (!allowed) return

        if (editId && editLoadedRef.current !== editId) {
          await openEditForm(editId)
        } else if (mode === 'list') {
          Taro.setNavigationBarTitle({ title: '管理用户成品' })
          await loadList(1, false)
        } else if (!editingId) {
          Taro.setNavigationBarTitle({ title: '上传用户成品' })
        }
      } catch {
        setIsAdmin(false)
      } finally {
        setChecking(false)
      }
    })()
  })

  const handleChooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const path = res.tempFilePaths[0]
      if (path) {
        setImagePath(path)
        setImageChanged(true)
      }
    } catch (error) {
      if ((error as { errMsg?: string })?.errMsg?.includes('cancel')) return
      Taro.showToast({ title: '选图失败', icon: 'none' })
    }
  }

  const handleSearchPosts = async () => {
    const trimmed = postKeyword.trim()
    if (!trimmed) {
      Taro.showToast({ title: '请输入图纸标题或关键词', icon: 'none' })
      return
    }
    setSearchingPosts(true)
    try {
      const result = await searchPosts(trimmed, 1)
      setPostResults(result.list)
      if (result.list.length === 0) {
        Taro.showToast({ title: '未找到相关图纸', icon: 'none' })
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '搜索失败',
        icon: 'none',
      })
    } finally {
      setSearchingPosts(false)
    }
  }

  const handleSearchAuthors = async () => {
    const trimmed = authorKeyword.trim()
    if (!trimmed) {
      Taro.showToast({ title: '请输入作者昵称', icon: 'none' })
      return
    }
    setSearchingAuthors(true)
    try {
      const next = await searchUsersByNickName(trimmed)
      setAuthorResults(next)
      if (next.length === 0) {
        Taro.showToast({ title: '未找到该昵称用户', icon: 'none' })
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '搜索失败',
        icon: 'none',
      })
    } finally {
      setSearchingAuthors(false)
    }
  }

  const selectPost = (post: PostSummary) => {
    setSelectedPost(post)
    if (!title.trim()) {
      setTitle(`${post.title} · 成品`)
    }
    if (!selectedAuthor && post.author?.openid) {
      setSelectedAuthor({
        openid: post.author.openid,
        nickName: post.author.nickName || '拼豆玩家',
        avatarUrl: post.author.avatarUrl || '',
      })
      setAuthorKeyword(post.author.nickName || '')
    }
  }

  const handleDelete = async (item: FinishedProductSummary) => {
    if (deletingId) return
    const confirmed = await new Promise<boolean>((resolve) => {
      Taro.showModal({
        title: '删除成品',
        content: `确定删除「${item.title}」吗？删除后不可恢复。`,
        confirmText: '删除',
        confirmColor: '#ef4444',
        cancelText: '取消',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      })
    })
    if (!confirmed) return

    setDeletingId(item._id)
    try {
      await deleteFinishedProduct(item._id)
      setList((prev) => prev.filter((row) => row._id !== item._id))
      Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '删除失败',
        icon: 'none',
      })
    } finally {
      setDeletingId('')
    }
  }

  const handleSubmit = async () => {
    if (!imagePath && !existingCoverFileId) {
      Taro.showToast({ title: '请上传成品照片', icon: 'none' })
      return
    }
    if (!selectedPost) {
      Taro.showToast({ title: '请关联图纸', icon: 'none' })
      return
    }
    if (!selectedAuthor?.openid) {
      Taro.showToast({ title: '请关联作者', icon: 'none' })
      return
    }
    if (!title.trim()) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }

    const isEdit = Boolean(editingId)
    setSubmitting(true)
    Taro.showLoading({ title: isEdit ? '保存中...' : '上传中...', mask: true })
    try {
      let coverFileId = existingCoverFileId
      if (imageChanged || !coverFileId) {
        coverFileId = await uploadCloudFile(
          `finished-products/${Date.now()}.jpg`,
          imagePath,
        )
      }
      if (isEdit) {
        await updateFinishedProduct({
          productId: editingId,
          title: title.trim(),
          coverFileId,
          postId: selectedPost._id,
          description: description.trim(),
          authorNickName: selectedAuthor.nickName,
          authorOpenid: selectedAuthor.openid,
        })
      } else {
        await createFinishedProduct({
          title: title.trim(),
          coverFileId,
          postId: selectedPost._id,
          description: description.trim(),
          authorNickName: selectedAuthor.nickName,
          authorOpenid: selectedAuthor.openid,
        })
      }
      Taro.hideLoading()
      Taro.showToast({ title: isEdit ? '保存成功' : '上传成功', icon: 'success' })
      setTimeout(() => {
        backToList()
      }, 800)
    } catch (error) {
      Taro.hideLoading()
      Taro.showToast({
        title: error instanceof Error ? error.message : (isEdit ? '保存失败' : '上传失败'),
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <View className='admin-upload-finished-page admin-upload-finished-page--empty'>加载中...</View>
  }

  if (!isAdmin) {
    return (
      <View className='admin-upload-finished-page admin-upload-finished-page--empty'>
        仅管理员可管理用户成品
      </View>
    )
  }

  if (mode === 'list') {
    return (
      <View className='admin-upload-finished-page'>
        <ScrollView scrollY className='admin-upload-finished-page__scroll admin-upload-finished-page__scroll--list'>
          <View className='admin-upload-finished-page__body'>
            <View className='admin-upload-finished-page__list-head'>
              <View>
                <Text className='admin-upload-finished-page__list-title'>用户成品</Text>
                <Text className='admin-upload-finished-page__list-desc'>上传、编辑或删除首页「成品」Tab 内容</Text>
              </View>
              <Button className='admin-upload-finished-page__create-btn' onClick={openCreateForm}>
                上传成品
              </Button>
            </View>

            {listLoading && list.length === 0 ? (
              <View className='admin-upload-finished-page__empty-card'>加载中...</View>
            ) : null}

            {!listLoading && list.length === 0 ? (
              <View className='admin-upload-finished-page__empty-card'>
                <Text className='admin-upload-finished-page__empty-title'>暂无成品</Text>
                <Text className='admin-upload-finished-page__empty-desc'>点击右上角上传第一张用户成品</Text>
              </View>
            ) : null}

            {list.map((item) => (
              <View key={item._id} className='admin-upload-finished-page__manage-card'>
                {item.coverUrl ? (
                  <Image className='admin-upload-finished-page__manage-cover' src={item.coverUrl} mode='aspectFill' />
                ) : (
                  <View className='admin-upload-finished-page__manage-cover admin-upload-finished-page__manage-cover--placeholder' />
                )}
                <View className='admin-upload-finished-page__manage-main'>
                  <Text className='admin-upload-finished-page__manage-title'>{item.title}</Text>
                  <Text className='admin-upload-finished-page__manage-meta'>
                    {item.author?.nickName || '未知作者'}
                    {item.postTitle ? ` · ${item.postTitle}` : ''}
                  </Text>
                  <View className='admin-upload-finished-page__manage-actions'>
                    <Text
                      className='admin-upload-finished-page__manage-link'
                      onClick={() => void openEditForm(item._id)}
                    >
                      编辑
                    </Text>
                    <Text
                      className='admin-upload-finished-page__manage-link admin-upload-finished-page__manage-link--danger'
                      onClick={() => void handleDelete(item)}
                    >
                      {deletingId === item._id ? '删除中...' : '删除'}
                    </Text>
                    <Text
                      className='admin-upload-finished-page__manage-link'
                      onClick={() => {
                        cacheFinishedProduct(item)
                        Taro.navigateTo({
                          url: `/pages/finished-product-detail/index?id=${item._id}`,
                        })
                      }}
                    >
                      预览
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {listHasMore && list.length > 0 ? (
              <Button
                className='admin-upload-finished-page__more-btn'
                loading={listLoading}
                onClick={() => void loadList(listPage + 1, true)}
              >
                加载更多
              </Button>
            ) : null}
          </View>
        </ScrollView>
      </View>
    )
  }

  const isEdit = Boolean(editingId)

  return (
    <View className='admin-upload-finished-page'>
      <ScrollView scrollY className='admin-upload-finished-page__scroll'>
        <View className='admin-upload-finished-page__body'>
          <View className='admin-upload-finished-page__form-back' onClick={backToList}>
            <Text>← 返回成品列表</Text>
          </View>

          <Text className='admin-upload-finished-page__section-title'>成品照片</Text>
          <View className='admin-upload-finished-page__photo' onClick={() => void handleChooseImage()}>
            {imagePath ? (
              <Image className='admin-upload-finished-page__photo-img' src={imagePath} mode='aspectFill' />
            ) : (
              <Text className='admin-upload-finished-page__photo-hint'>点击选择照片</Text>
            )}
          </View>
          {isEdit ? (
            <Text className='admin-upload-finished-page__section-hint'>点击照片可更换；不更换则保留原图</Text>
          ) : null}

          <Text className='admin-upload-finished-page__section-title'>标题</Text>
          <Input
            className='admin-upload-finished-page__input'
            value={title}
            placeholder='例如：某某图纸成品'
            maxlength={40}
            onInput={(e) => setTitle(e.detail.value)}
          />

          <Text className='admin-upload-finished-page__section-title'>备注（可选）</Text>
          <Textarea
            className='admin-upload-finished-page__textarea'
            value={description}
            placeholder='可补充成品说明'
            maxlength={200}
            onInput={(e) => setDescription(e.detail.value)}
          />

          <Text className='admin-upload-finished-page__section-title'>关联图纸</Text>
          <View className='admin-upload-finished-page__search-row'>
            <Input
              className='admin-upload-finished-page__input admin-upload-finished-page__input--flex'
              value={postKeyword}
              placeholder='搜索图纸标题'
              confirmType='search'
              onInput={(e) => setPostKeyword(e.detail.value)}
              onConfirm={() => void handleSearchPosts()}
            />
            <Button
              className='admin-upload-finished-page__search-btn'
              loading={searchingPosts}
              onClick={() => void handleSearchPosts()}
            >
              搜索
            </Button>
          </View>

          {selectedPost ? (
            <View className='admin-upload-finished-page__selected'>
              <Text className='admin-upload-finished-page__selected-label'>已关联图纸</Text>
              <Text className='admin-upload-finished-page__selected-title'>{selectedPost.title}</Text>
            </View>
          ) : null}

          {postResults.map((item) => (
            <View
              key={item._id}
              className={`admin-upload-finished-page__result${selectedPost?._id === item._id ? ' is-active' : ''}`}
              onClick={() => selectPost(item)}
            >
              {item.coverUrl ? (
                <Image className='admin-upload-finished-page__result-cover' src={item.coverUrl} mode='aspectFill' />
              ) : (
                <View className='admin-upload-finished-page__result-cover admin-upload-finished-page__result-cover--placeholder' />
              )}
              <View className='admin-upload-finished-page__result-main'>
                <Text className='admin-upload-finished-page__result-title'>{item.title}</Text>
                <Text className='admin-upload-finished-page__result-meta'>
                  {item.author?.nickName || '未知作者'} · {item.width}x{item.height}
                </Text>
              </View>
            </View>
          ))}

          <Text className='admin-upload-finished-page__section-title'>关联作者</Text>
          <Text className='admin-upload-finished-page__section-hint'>按昵称搜索用户；选图纸后会默认带出图纸作者，可再改</Text>
          <View className='admin-upload-finished-page__search-row'>
            <Input
              className='admin-upload-finished-page__input admin-upload-finished-page__input--flex'
              value={authorKeyword}
              placeholder='搜索作者昵称'
              confirmType='search'
              onInput={(e) => setAuthorKeyword(e.detail.value)}
              onConfirm={() => void handleSearchAuthors()}
            />
            <Button
              className='admin-upload-finished-page__search-btn'
              loading={searchingAuthors}
              onClick={() => void handleSearchAuthors()}
            >
              搜索
            </Button>
          </View>

          {selectedAuthor ? (
            <View className='admin-upload-finished-page__selected'>
              <Text className='admin-upload-finished-page__selected-label'>已关联作者</Text>
              <View className='admin-upload-finished-page__selected-author-row'>
                {selectedAuthor.avatarUrl ? (
                  <Image
                    className='admin-upload-finished-page__author-avatar'
                    src={selectedAuthor.avatarUrl}
                    mode='aspectFill'
                  />
                ) : (
                  <View className='admin-upload-finished-page__author-avatar admin-upload-finished-page__author-avatar--placeholder' />
                )}
                <Text className='admin-upload-finished-page__selected-title'>{selectedAuthor.nickName}</Text>
              </View>
            </View>
          ) : null}

          {authorResults.map((item) => (
            <View
              key={item.openid}
              className={`admin-upload-finished-page__result${selectedAuthor?.openid === item.openid ? ' is-active' : ''}`}
              onClick={() => setSelectedAuthor(item)}
            >
              {item.avatarUrl ? (
                <Image className='admin-upload-finished-page__result-cover admin-upload-finished-page__result-cover--round' src={item.avatarUrl} mode='aspectFill' />
              ) : (
                <View className='admin-upload-finished-page__result-cover admin-upload-finished-page__result-cover--round admin-upload-finished-page__result-cover--placeholder' />
              )}
              <View className='admin-upload-finished-page__result-main'>
                <Text className='admin-upload-finished-page__result-title'>{item.nickName}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className='admin-upload-finished-page__footer'>
        <Button
          className='admin-upload-finished-page__submit'
          loading={submitting}
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {isEdit ? '保存修改' : '发布成品'}
        </Button>
      </View>
    </View>
  )
}

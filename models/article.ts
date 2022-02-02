import { ApolloError } from 'apollo-server'
import { Auth } from '.'
import { Main } from '../dataSources'
import { generateSlug, localize, defaultPaginations, addToBuildQueue, triggerGatsbyBuild } from '../utils'
import fs from 'firebase-admin'
import moment from 'moment'
import { Renderer } from 'prosemirror-to-html-js'

import algoliasearch from 'algoliasearch'
const algoliaClient = algoliasearch(process.env.ALGOLIA_APPLICATION_ID, process.env.ALGOLIA_ADMIN_KEY)
const algoliaIndex = algoliaClient.initIndex(process.env.ALGOLIA_INDEX_PREFIX + '_ARTICLES')

const updateAlgoliaIndex = async ({ article }) => {
  const renderer = new Renderer();
  let body = renderer.render(article.body);
  body = body.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "");
  body = body.replace(/\[.*?\]/g,'');
  const algoliaObject = {
    objectID: article.id,
    id: article.id,
    title: article.title,
    teaser: article.teaser,
    slug: article.slug,
    createdAt: article.createdAt,
    body
  }
  console.log("algoliaObject",algoliaObject)
  const algoliaResponse = await algoliaIndex.saveObject(algoliaObject)
  console.log("algoliaResponse",algoliaResponse)
  return true
}

export const generateArticleModel = ({ server, user, languages }) => ({
  async list({ filters, pagination }) {
    if (server == "admin") {
      if (!user) throw new ApolloError('Not authenticated', '401')
      if (user.type !== "ADMIN") throw new ApolloError('Not authorized', '403')
      const operationType = 'VIEW'
      const requiredPermission = 'ARTICLE_VIEW'
      const hasAccess = await Auth.isPermitted({ user, operationType, requiredPermission })
      if (hasAccess !== true) throw new ApolloError("Not authorized", '403')      
    }

    if (server == "app") {
      const now = parseFloat(moment().format('x'))
      if (!filters) filters = []
      filters.push({ field: 'publishedAt', operator: '<=', value: now })
      filters.push({ field: 'status', operator: '==', value: 'PUBLISHED'})
    }
    
    pagination = (pagination) ? pagination : defaultPaginations.publishedAt
    
    const collectionPath = 'articles'
    const response = await Main.list({ collectionPath, filters, pagination, languages })
    const results = localize({ value: response.results, languages })

    /*
    // used for initially getting all articles for algolia indexing
    const articles = []
    for (let article of results) {
      const renderer = new Renderer();
      article.body = renderer.render(article.body);
      article.body = article.body.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "");
      article.body = article.body.replace(/\[.*?\]/g,'');
      
      article.objectID = article.id
      articles.push(article)
    }
    */
    return { 
      articles: results,
      paginationInfo: response.paginationInfo
    }
  },

  async get ({ input }) {
    if (server == "admin") {
      if (!user) throw new ApolloError('Not authenticated', '401')
      if (user.type !== "ADMIN") throw new ApolloError('Not authorized', '403')
      const operationType = 'VIEW'
      const requiredPermission = 'ARTICLE_VIEW'
      const hasAccess = await Auth.isPermitted({ user, operationType, requiredPermission })
      if (hasAccess !== true) throw new ApolloError("Not authorized", '403')
    }
    if (!input.id && !input.slug) throw new ApolloError("Nothing to look up on", '422')
    if (!input.id) {
      await fs.firestore()
              .collection('articles')
              .where('isDeleted','==',false)
              .where('slug','==',input.slug)
              .where('status','==','PUBLISHED')
              .where('publishedAt','>',parseFloat(moment().format('x')))
              .get()
              .then(async snapshot => {
                if (snapshot.empty) throw new ApolloError("Nothing found", '422')
                input.id = snapshot.docs[0].id
              })
    }
    if (!input.id) throw new ApolloError("Nothing found", '422')

    const docPath = 'articles/'+input.id
    let response = await Main.get({ docPath })
    response = localize({ value: response, languages })

    if (server == "app") {
      if (response.status != "PUBLISHED" || response.publishedAt > parseFloat(moment().format('x'))) {
        if (!input.previewToken || input.previewToken !== response.previewToken) throw new ApolloError("Not available: " + input.id, '422')
      }
    }

    return response
  },

  async create({ input }) {
    if (!user) throw new ApolloError('Not authenticated', '401')
    if (user.type !== "ADMIN") throw new ApolloError('Not authorized', '403')
    const operationType = 'CREATE'
    const requiredPermission = 'ARTICLE_CREATE'
    const hasAccess = await Auth.isPermitted({ user, operationType, requiredPermission })
    if (hasAccess !== true) throw new ApolloError("Not authorized", '403')

    const now = parseFloat(moment().format('x'))
    let payload = input
    if (!payload.status) payload.status = "DRAFT"
    if (!payload.priority) payload.priority = "DEFAULT"
    if (!payload.authorUserId) payload.authorUserId = user.id
    if (!payload.publishedAt) payload.publishedAt = now
    if (payload.image) {
      payload.image.cloudinaryAssetData = true
      payload.image.cloudName = "pley-gg"
    }

    payload.previewToken = Buffer.from('time' + new Date()).toString('base64')
    // supported language is only english for now
    payload.localeSlug = {
      en: await generateSlug({ value: input.localeTitle.en, collection: 'articles', locale: true, language: "en" })
    }

    const collectionPath = 'articles'
    let response = await Main.create({ collectionPath, payload, userId: user.id })
    response = localize({ value: response, languages })

    if (response.status == "PUBLISHED") {
      await updateAlgoliaIndex({ article: response })
      await addToBuildQueue({ event: "UPDATE", eventCollection: "Article", eventItemId: response.id, publishedAt: response.publishedAt })
    }
    //if (response.status == "DRAFT") await addToBuildQueue({ event: "DELETE", eventCollection: "Article", eventItemId: response.id })
    await triggerGatsbyBuild()

    return { article: response }
  },

  async update({ input }) {
    if (!user) throw new ApolloError('Not authenticated', '401')
    if (user.type !== "ADMIN") throw new ApolloError('Not authorized', '403')
    const operationType = 'UPDATE'
    const requiredPermission = 'ARTICLE_UPDATE'
    const hasAccess = await Auth.isPermitted({ user, operationType, requiredPermission })
    if (hasAccess !== true) throw new ApolloError("Not authorized", '403')
    

    const id = input.id
    const docPath = 'articles/'+id
    const currentVersion = await Main.get({ docPath })

    let payload = input
    if (payload.status == "DRAFT") {
      payload.previewToken = Buffer.from('time' + new Date()).toString('base64')
    } else (
      payload.previewToken = fs.firestore.FieldValue.delete()
    )

    if (payload.image) {
      payload.image.cloudinaryAssetData = true
      payload.image.cloudName = "pley-gg"
    }

    delete input.id
    let response = await Main.update({ docPath, payload: input, userId: user.id })
    response = localize({ value: response, languages })

    if (response.status == "PUBLISHED") {
      await updateAlgoliaIndex({ article: response })
      await addToBuildQueue({ event: "UPDATE", eventCollection: "Article", eventItemId: response.id, publishedAt: response.publishedAt })
    }
    if (currentVersion.status == "PUBLISHED" && currentVersion.publishedAt < Date.now() && response.status == "DRAFT") {
      await algoliaIndex.deleteObject(response.id)
      await addToBuildQueue({ event: "DELETE", eventCollection: "Article", eventItemId: response.id })
    }
    await triggerGatsbyBuild()
    return { article: response }
  },

  async delete ({ input }) {
    if (!user) throw new ApolloError('Not authenticated', '401')
    if (user.type !== "ADMIN") throw new ApolloError('Not authorized', '403')
    const operationType = 'DELETE'
    const requiredPermission = 'ARTICLE_DELETE'
    const hasAccess = await Auth.isPermitted({ user, operationType, requiredPermission })
    if (hasAccess !== true) throw new ApolloError("Not authorized", '403')

    const docPath = 'articles/'+input.id
    const subCollections = ['locations']

    const response = await Main.deleteSoft({ docPath, subCollections, userId: user.id })
    
    await algoliaIndex.deleteObject(input.id)
    await addToBuildQueue({ event: "DELETE", eventCollection: "Article", eventItemId: input.id })
    await triggerGatsbyBuild()

    return response
  },
})
import { defaultPaginations } from '../utils'

export const articleTypeDefsBase = `
  type Article {
    id: ID!
    image: Image!
    createdAt: Timestamp!
    lastUpdatedAt: Timestamp
    title: String!
    #localeTitle: LocaleString!
    teaser: String
    #localeTeaser: LocaleString!
    body: String!
    #localeBody: LocaleString!
    slug: String!
    #localeSlug: LocaleString!
    author: Author!

    priority: ArticlePriority!
    
    publishedAt: Timestamp
    hashTag: String
    userId: ID
    teamMentions: [TeamMention]
    playerMentions: [PlayerMention]
  }


  type ArticleConnection {
    articles: [Article]
    paginationInfo: PaginationInfo!
  }

  type ArticlePayload {
    article: Article
  }

  input GetArticlesInput {
    filters: [ArticleFilterInput]
    pagination: ArticlePaginationInput
  }

  input GetArticleInput {
    id: ID
    slug: String
    previewToken: String
  }

  input ArticleFilterInput {
    field: ArticleFilterField
    operator: FilterOperator!
    value: [FilterValue!]
  }
  
  input ArticlePaginationInput {
    limit: PaginationAmount
    after: String
    orderByField: ArticleOrderByField
    sortOrder: SortOrder
  }

  enum ArticleFilterField {
    PRIORITY
    PUBLISHED_AT
    #PLAYER_ID
    #TEAM_ID
    #FIXTURE_ID
  }

  enum ArticleOrderByField {
    PUBLISHED_AT
  }

  enum ArticlePriority {
    DEFAULT
    TOP_STORY
    BREAKING
  }

  enum ArticleChannel {
    TWITTER
  }

  extend type Query {
    getArticles(input: GetArticlesInput): ArticleConnection!
    getArticle(input: GetArticleInput!): Article!
  }
`

export const articleTypeDefsApp = ``

export const articleTypeDefsAdmin = `
  extend type Article {
    createdBy: User!
    status: ArticleStatus!
    previewToken: String
  }

  enum ArticleStatus {
    DRAFT
    PUBLISHED
    DELETED
  }

  input CreateArticleInput {
    image: ImageInput!
    localeTitle: LocaleStringInput!
    localeTeaser: LocaleStringInput!
    localeBody: LocaleStringInput!
    status: ArticleStatus
    priority: ArticlePriority!
    publishedAt: Timestamp
    hashTag: Boolean
    userId: ID
    teamMentions: [TeamMentionInput]
    playerMentions: [PlayerMentionInput]
  }
  
  input UpdateArticleInput {
    id: ID!
    image: ImageInput
    localeTitle: LocaleStringInput
    localeTeaser: LocaleStringInput
    localeBody: LocaleStringInput
    status: ArticleStatus
    priority: ArticlePriority
    publishedAt: Timestamp
    hashTag: Boolean
    userId: ID
    teamMentions: [TeamMentionInput]
    playerMentions: [PlayerMentionInput]
  }

  input DeleteArticleInput {
    id: ID!
  }

  type CreateArticlePayload {
    article: Article
  }
  type UpdateArticlePayload {
    article: Article
  }
  type DeleteArticlePayload {
    success: Boolean!
  }

  extend type Mutation {
    createArticle(input: CreateArticleInput!): CreateArticlePayload!
    updateArticle(input: UpdateArticleInput!): UpdateArticlePayload!
    deleteArticle(input: DeleteArticleInput!): DeleteArticlePayload!
  }
`

export const articleResolversBase = {
  ArticleFilterField: {
    PRIORITY: 'priority',
    PUBLISHED_AT: 'publishedAt',
  },

  ArticleOrderByField: {
    PUBLISHED_AT: 'publishedAt',
  },

  Query: {
    async getArticles (_, { input }, context) {
      const filters = input?.filters
      const pagination = {
        ...input?.pagination,
        ...defaultPaginations.publishedAt
      }

      const response = await context.models.Article.list({ filters, pagination })
      return response
    },

    async getArticle (_, { input }, context) {
      console.log("getArticle: " + input.id)
      const response = await context.models.Article.get({ input })
      return response
    },
  },

  Article: {
  	author: async(parent, __, context) => {
      if (!parent.createdBy) return
      const input = { id: parent.authorUserId }
      const response = context.models.User.getAuthor({ input })
      return response
    },
  },
}

export const articleResolversApp = {}
export const articleResolversAdmin = {
  Mutation: {
    async createArticle (_, { input }, context) {
      const response = await context.models.Article.create({ input })
      return response
    },

    async updateArticle (_, { input }, context) {
      const response = await context.models.Article.update({ input })
      return response
    },

    async deleteArticle (_, { input }, context) {
      const response = await context.models.Article.delete({ input })
      return response
    },
  },


  Article: {
  	createdBy: async(parent, __, context) => {
      if (!parent.createdBy) return
      const input = { id: parent.createdBy }
      const response = context.models.User.getAdmin({ input })
      return response
    },
  },
}
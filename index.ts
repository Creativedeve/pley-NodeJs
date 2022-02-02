// On app engine NODE_ENV is always production and app engine starts the server with npm start
// So the right yaml file for development or production must be provided when deploying, containing the right server settings and env vars

// On localhost however, using npm run start:dev or npm run start:prod, NODE_SRV is set to localhost
// And NODE_ENV is set to either development or production
// On localhost .env or .env.development is then used depending on NODE_ENV set in package.json npm scripts
// While on app engine, .env and .env.development is not used, only the yaml files

// Don't use production on localhost!

console.log("process.env.NODE_ENV",process.env.NODE_ENV)
if (process.env.NODE_SRV == "localhost") {
  const environment = process.env.NODE_ENV
  require('custom-env').env(environment)
  console.log("Environment: " + environment)
}
console.log("Project: " + process.env.GCLOUD_PROJECT_ID)

import express from 'express'
import { ApolloServer, ApolloError } from 'apollo-server-express'
//import { createComplexityLimitRule } from 'graphql-validation-complexity'
import depthLimit from 'graphql-depth-limit'
import compression from 'compression'

import { Auth } from './models'
import { schemaApp, schemaAdmin } from './schemas'
import { generateArticleModel} from './models'

import fs from 'firebase-admin'
fs.initializeApp({ 
  credential: fs.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
});
// storageBucket: `pleygg.appspot.com`
// fs.firestore().settings( { timestampsInSnapshots: true })

export interface IGetUserAuthInfoRequest extends Request {
  server: "admin" | "app",
  languages: [ "en" | "da" | "es" | "de" ],
  models: any,
  user: {
    id: string,
    role: string
  }
}

const serverApp  = new ApolloServer({
  context: async ({ req }) => {   
    const server = "app" 
    const languages = ["en"]
    let payload = <IGetUserAuthInfoRequest> { server, languages }
    const token = req.headers.token
    const user = await Auth.authUser({ server, token })
    payload.user = user
    payload.models = {
      Article: generateArticleModel({ server, user, languages })
    }
    return payload
  },
  schema: schemaApp,
  validationRules: [
    depthLimit(10),
  ],
  engine: {
    apiKey: process.env.APOLLO_KEY
  },
  tracing: false,
  introspection: true,
  playground: true
});

const serverAdmin = new ApolloServer({
  context: async ({ req }) => {
    const server = "admin" 
    const languages = ["en"]
    let payload = <IGetUserAuthInfoRequest> { server, languages }
    const token = req.headers.token
    const user = await Auth.authUser({ server, token })
    payload.user = user
    payload.models = {
      Article: generateArticleModel({ server, user, languages })
    }
    return payload
  },
  schema: schemaAdmin,
  validationRules: [
    depthLimit(10),
  ],
  engine: {
    apiKey: process.env.APOLLO_KEY_ADMIN
  },
  tracing: true,
  introspection: true,
  playground: true
});


//require('events').EventEmitter.defaultMaxListeners = 1000
//process.on('warning', e => console.warn(e.stack));
const app = express()
app.use(compression())

serverApp.applyMiddleware({ app,  path: '/app' })
serverAdmin.applyMiddleware({ app, path: '/admin' });

// localhost port: 8000. On app engine use app engine default port, set in env. vars
let port
if (process.env.PORT) {
  port = process.env.PORT
} else {
  port = 8010
}

app.listen({ port }, () => {
  console.log('Apollo Server is running');
});
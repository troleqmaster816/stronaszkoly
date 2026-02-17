import { createConfig } from './app/config.js'
import { createApp } from './app/createApp.js'

const config = createConfig()
const app = createApp(config)

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`)
})

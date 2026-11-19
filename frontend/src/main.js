import './style/reset.css'
import './style/main.sass'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')

<template>
  <div class="p-6 max-w-xl mx-auto">
    <h1>Short Link Service</h1>
    <p>POST <code>/v1/links</code> with JSON <code>{"url": "https://example.com"}</code> to create a short link.</p>

    <div class="short-item">
      <input v-model="inputUrl" type="text">
      <button @click="createShortLink">生成短连接</button>
    </div>

  </div>
</template>


<script setup lang="ts">
import { ref } from 'vue';


const inputUrl = ref("")
/**
 * 调用 /v1/links 接口，生成短链接
 */
const createShortLink = async (url: string): Promise<null> => {
  try {
    const url = inputUrl.value;
    const data = await $fetch('http://localhost:3000/api/v1/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: { url }
    }).then((res) => {
      console.log(res,"res")
    })
    return null
  } catch (err) {
    console.error('请求失败', err)
    return null
  }
}

</script>
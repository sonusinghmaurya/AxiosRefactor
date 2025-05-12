import { cache } from '~/assets/js/cache'

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig()
  const userStore = useUserStore()
  const appData = useAppStore()
  const localePath = useLocalePath()
  const route = useRoute()

  /**
   * Call an api specified in apiRoutes
   * @param {string} path - the api path
   * @param {object} params - params to send
   * @param {string} [cacheKey] - optional, if specified, will save and load from cache
   * @returns {Promise}
   */

  //trim string values in payload i.e. params, nested too
  const trimStrings = (data) => {
    if (typeof data === 'string') {
      return data.trim();
    } else if (Array.isArray(data)) {
      return data.map(trimStrings);
    } else if (typeof data === 'object' && data !== null) {
      return Object.keys(data).reduce((acc, key) => {
        acc[key] = trimStrings(data[key]);
        return acc;
      }, {});
    }
    return data;
  };

  const notifyDebug = async (path, res) => {
    try {
      $fetch('/api/slackNotify', {
        method: 'POST',
        body: JSON.stringify({
          channel: "C07QVAL63D0",
          attachments: [
            {
              fallback: 'API FETCH got issue',
              pretext: `*${config.public.ENV} - v${config.public.VERSION}*`,
              title: 'API FETCH got issue',
              title_link: config.API_DOMAIN,
              text: `${`\`\`\`API ROUTE\n${path}\n\`\`\``}
                  \n${`\`\`\`MERCHANT\n${config.public.MERCHANT || "N/A"}\n\`\`\``}
                  \n${`\`\`\`Response\n${typeof res == 'object' ? JSON.stringify(res) : res }\n\`\`\``}`,
              color: "#f2c744" // Yellow for warning
            }
          ]
        })
      });
    } catch (e) { 
      console.log(e)
    }
  }
  const apiFetch = async (path, params = {}, cacheKey, type) => {
    params = trimStrings(params);
    let additionalData = {};
    if (cacheKey) {
      if (!cache.ready) {
        await cache.init();
      }
      const cacheRes = await cache.getData(cacheKey);
      if (cacheRes.status) {
        return cacheRes.data;
      }
    }

    const { $i18n } = useNuxtApp();
    let [lang, country] = $i18n.locale.value.split("-");
    if (userStore?.loggedIn && userStore?.data) {
      additionalData.merchant_id = userStore?.data?.merchant_id;
      additionalData.admin_id = userStore?.data?.id;
      additionalData.aid = userStore?.data?.id;
    }
    let fetchOptions = {
      method: "POST",
      body: { ...params, ...additionalData },
      headers: {
        type: type,
        page: route.path,
        lang: `${lang}-${country.toUpperCase()}`,
        loggedIn: userStore?.loggedIn,
        domain: typeof window == 'object' ? window.location.host : '',
        gmt: ((!["staging","pre-production", "production"].includes(config.public.ENV_CHECKER) || config.public.time_zone_enable) ? appData.data.gmt : params.gmt) || "+08:00",
        /* domain: typeof window == 'object' ? window.location.host : '',
              device: isMobile ? 'mobile' : 'desktop' */
      },
    };
    try {
      const res = await $fetch(`/api/be/${path}`, fetchOptions);
      if (res?.statusCode === 401 && res?.ip_blocked) {
        const canAccess = useState("canAccess"); // delcared in app.vue
        const ip = useState("ip"); // delcared in app.vue
        canAccess.value = false;
        ip.value = res.ip;
        return res
      }
      else if (res?.statusCode === 401 && path != "auth/login" && path != "auth/redirectToLogin") {
        await userStore.logout(localePath("/"));
      }
      else {
        if (cacheKey && res.success) { // store to the indexDB only if key is there and res.success is true
          cache.setData(res, cacheKey);
        }
        return res;
      }
    } catch (err) {
        notifyDebug(path,{
          name:err?.name,
          val:err?.value,
          err:err
        })
      return {
        success: false
        // message: $i18n.t("no_internet_connection")
      };
    }
  }
  const get = async (path, params = {}, cacheKey) => {
    return await apiFetch(path, params, cacheKey, 'GET')
  }
  const post = async (path, params = {}, cacheKey) => {
    return await apiFetch(path, params, cacheKey, 'POST')
  }
  const patch = async (path, params = {}, cacheKey) => {
    return await apiFetch(path, params, cacheKey, 'PATCH')
  }
  const put = async (path, params = {}, cacheKey) => {
    return await apiFetch(path, params, cacheKey, 'PUT')
  }
  const del = async (path, params = {}, cacheKey) => {
    return await apiFetch(path, params, cacheKey, 'DELETE')
  }
  const custom = async (path, params = {}, cacheKey) => {
    // when we need to call a custom route using routes.js to preprocess the data (req/res)
    try {
      const res = await apiFetch(path, params, cacheKey, 'CUSTOM')
      return res
    } catch (error) {
      return error
    }
  }
  return {
    provide: {
      apiFetch: {
        get,
        post,
        patch,
        put,
        del,
        custom
      },
    }
  };
});

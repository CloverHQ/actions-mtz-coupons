import fetch, { createCookieJar } from '../fetch.js'
import gundamGrab from './gundamGrab.js'
import DCwpqO from './DCwpqO.js'
import { couponId, ECODE, HOST } from './const.js'

function createMTCookie(token) {
  const cookieJar = createCookieJar(token)
  const domain = 'Domain=.meituan.com'
  const path = 'Path=/'
  const http = 'HttpOnly'
  const expire = 'Max-Age=3600'
  const content = token.startsWith('token=') ? token : `token=${token}`
  const cookieStr = [content, domain, path, http, expire].join(';')

  cookieJar.setCookie(cookieStr, HOST)

  return cookieJar
}

async function getMTUerId() {
  const rep = await fetch('https://h5.waimai.meituan.com/waimai/mindex/home')

  const repCookie = rep.headers.get('set-cookie') || ''
  const matchArr = repCookie.match(/userId=(\w+)/) || []

  return matchArr[1] || ''
}

async function getUserInfo(cookie) {
  const res = await fetch.post(`${HOST}/gundam/gundamLogin`, null, {
    cookie: cookie
  })

  if (res.code == 0) return res.data

  if (res.code == 3) {
    throw { code: ECODE.AUTH, api: 'gundamLogin', msg: res.msg || res.message }
  }

  throw { code: ECODE.API, api: 'gundamLogin', msg: res.msg || res.message }
}

async function runTask(cookie) {
  try {
    // 优先检测登录状态
    const userInfo = await getUserInfo(cookie)
    const grabResult = []

    // 主活动，失败时向外抛出异常
    const mainResult = await gundamGrab.grabCoupon(cookie, couponId.main.gid)

    grabResult.push(...mainResult)

    try {
      const qualityShopResult = await gundamGrab.grabCoupon(
        cookie,
        couponId.shop.gid
      )

      grabResult.push(...qualityShopResult)
    } catch {
      // 仅对某些用户群体生效
    }

    // try {
    //   const DCwpqOResult = await DCwpqO.grabCoupon(cookie)

    //   grabResult.push(...DCwpqOResult)
    // } catch (e) {
    //   console.log('eeee', e)
    //   // 仅对某些用户群体生效
    // }

    return {
      code: ECODE.SUCC,
      data: {
        user: userInfo,
        coupons: grabResult
      },
      msg: '成功'
    }
  } catch (e) {
    let code, msg

    // console.log('getCoupons error', e)

    switch (e.code) {
      case ECODE.AUTH:
        code = ECODE.AUTH
        msg = '登录过期'
        break
      case fetch.ECODE.FETCH:
        code = ECODE.API
        msg = '接口异常'
        break
      case fetch.ECODE.TIMEOUT:
      case fetch.ECODE.NETWOEK:
        code = ECODE.NETWOEK
        msg = '网络异常'
        break
      default:
        code = ECODE.RUNTIME
        msg = '程序异常'
    }

    return { code, msg, error: e }
  }
}

/**
 * 领取优惠券
 * @param  {String} token 用户 token
 * @param  {Number} maxRetry  最大重试次数
 * @return {Promise(<Object>)} 结果
 */
async function getCoupons(token, { maxRetry = 0, httpProxy }) {
  if (!token) {
    return {
      code: ECODE.RUNTIME,
      msg: '请设置 token',
      error: ''
    }
  }

  const cookieJar = createMTCookie(token)

  if (httpProxy) {
    fetch.setProxyAgent(httpProxy)
  }

  async function main(retryTimes = 0) {
    const result = await runTask(cookieJar)
    const needRetry = [fetch.ECODE.NETWOEK, fetch.ECODE.API].includes(
      result.code
    )

    // 标记重试次数
    result['retryTimes'] = retryTimes

    if (!needRetry || retryTimes >= maxRetry) return result

    return main(++retryTimes)
  }

  return main()
}

export { getCoupons, ECODE }

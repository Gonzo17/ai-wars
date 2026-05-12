import type { FetchOptions } from 'ofetch'

export function useAuthFetch() {
  const supabase = useSupabaseClient()

  return async function authFetch<T>(request: string, options: FetchOptions = {}) {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    const headers = {
      ...(options.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    }

    return await $fetch<T>(request, { ...options, headers } as Parameters<typeof $fetch<T>>[1])
  }
}

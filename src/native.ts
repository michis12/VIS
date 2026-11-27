import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
import { t } from './i18n'

/**
 * Bridges to the native iOS shell (ios/App/App/*Plugin.swift).
 * Everything here is a no-op unless the web build runs inside the Capacitor iOS app:
 * the PWA and the browser keep their web tab bar and the server-push rest signal.
 */
export const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

interface RestActivityPlugin {
  start(o: {
    startAt: number
    endAt: number
    title: string
    subtitle?: string
    doneText: string
    notifyTitle: string
    notifyBody: string
  }): Promise<{ activity: boolean }>
  update(o: { endAt: number }): Promise<void>
  end(o: { finished: boolean }): Promise<void>
}

interface NativeTab { id: string; label: string; icon: string }
interface NativeTabsPlugin {
  configure(o: { tabs: NativeTab[]; selected: string }): Promise<{ available: boolean; bottom?: number }>
  select(o: { id: string }): Promise<void>
  setVisible(o: { visible: boolean }): Promise<void>
  addListener(event: 'tabChange', cb: (e: { id: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'layout', cb: (e: { bottom: number }) => void): Promise<PluginListenerHandle>
}

const RestActivity = registerPlugin<RestActivityPlugin>('RestActivity')
const NativeTabs = registerPlugin<NativeTabsPlugin>('NativeTabs')
const quiet = () => { /* older app build without the plugin, or Live Activities switched off */ }

// ---------- rest timer → Live Activity (Dynamic Island + lock screen) ----------

/** Starts the Live Activity for a rest that ends at `endAt` (ms). */
export function nativeRestStart(endAt: number, nextExercise?: string) {
  if (!isNativeIOS()) return
  const body = nextExercise ? t(`Weiter mit ${nextExercise}`, `Next up: ${nextExercise}`) : t('Zeit für den nächsten Satz', 'Time for the next set')
  RestActivity.start({
    startAt: Date.now(),
    endAt,
    title: t('Pause', 'Rest'),
    subtitle: nextExercise ? t(`Danach: ${nextExercise}`, `Next: ${nextExercise}`) : undefined,
    doneText: t('Pause vorbei', 'Rest over'),
    notifyTitle: t('Pause vorbei', 'Rest over'),
    notifyBody: body,
  }).catch(quiet)
}

/** Rest extended / shortened. */
export function nativeRestUpdate(endAt: number) {
  if (!isNativeIOS()) return
  RestActivity.update({ endAt }).catch(quiet)
}

/** Rest skipped (finished = false) or ran out (finished = true). */
export function nativeRestEnd(finished = false) {
  if (!isNativeIOS()) return
  RestActivity.end({ finished }).catch(quiet)
}

// ---------- native iOS 26 tab bar (Liquid Glass) ----------

// Anything that covers the web tab bar also has to hide the native one, which sits above the web view.
const COVERS = '.overlay, .scrim, .sheet, .fullsheet, .scanner, .scan-check, .welcome, .celebrate'

/**
 * Hands the tab bar to iOS when the app runs on iOS 26+. Returns true while the native
 * bar is in charge; the web `.tabbar` is then hidden via `html.native-tabs`.
 */
export function useNativeTabs(tabs: NativeTab[], selected: string, onSelect: (id: string) => void, hidden: boolean) {
  const [active, setActive] = useState(false)
  const [covered, setCovered] = useState(false)
  const pick = useRef(onSelect)
  pick.current = onSelect
  const sel = useRef(selected)
  sel.current = selected
  const key = tabs.map((x) => x.id + x.label + x.icon).join('|')

  useEffect(() => {
    if (!isNativeIOS()) return
    let gone = false
    const root = document.documentElement
    const setBottom = (b?: number) => { if (b) root.style.setProperty('--native-bottom', `${Math.round(b)}px`) }
    const subs = [
      NativeTabs.addListener('tabChange', (e) => pick.current(e.id)),
      NativeTabs.addListener('layout', (e) => setBottom(e.bottom)),
    ]
    NativeTabs.configure({ tabs, selected: sel.current }).then((r) => {
      if (gone || !r.available) return
      setBottom(r.bottom)
      root.classList.add('native-tabs')
      setActive(true)
    }).catch(quiet)
    return () => {
      gone = true
      subs.forEach((s) => s.then((h) => h.remove()).catch(quiet))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers tabs
  }, [key])

  useEffect(() => {
    if (active) NativeTabs.select({ id: selected }).catch(quiet)
  }, [active, selected])

  // watch for sheets / full-screen layers that would otherwise sit under the native bar
  useEffect(() => {
    if (!active) return
    let raf = 0
    const check = () => { raf = 0; setCovered(!!document.querySelector(COVERS)) }
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(check) })
    mo.observe(document.body, { childList: true, subtree: true })
    check()
    return () => { mo.disconnect(); cancelAnimationFrame(raf) }
  }, [active])

  const visible = !hidden && !covered
  useEffect(() => {
    if (active) NativeTabs.setVisible({ visible }).catch(quiet)
  }, [active, visible])

  return active
}

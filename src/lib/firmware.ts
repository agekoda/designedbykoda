// Over-the-air updates: which firmware each calendar should be running, and the headers that
// offer it. The releases themselves are made by scripts/firmware-release.mjs, which signs the
// .bin, copies it to public/fw/ and records it in src/data/firmware-releases.json. See OTA.md.
import data from '../data/firmware-releases.json';

export type Release = { version: string; size: number; sha256: string; sig: string; date: string; notes?: string };
export type Channel = 'stable' | 'beta';
type ChannelCfg = { version: string | null; auto: boolean };
const RELEASES = data as unknown as { channels: Record<Channel, ChannelCfg>; releases: Release[] };

const parse = (v: string) => (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v) ? v.split('.').map(Number) : null);
// <0 when a is older than b
export function compareVersions(a: string, b: string): number {
	const x = parse(a), y = parse(b);
	if (!x || !y) return 0;
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
}

export const channelOf = (raw: unknown): Channel => (raw === 'beta' ? 'beta' : 'stable');

// The release a calendar on this channel should be running, if any.
export function targetFor(channel: Channel): (Release & { auto: boolean }) | null {
	const cfg = RELEASES.channels[channel] ?? RELEASES.channels.stable;
	if (!cfg?.version) return null;
	const r = RELEASES.releases.find((x) => x.version === cfg.version);
	return r ? { ...r, auto: cfg.auto !== false } : null;
}

// Only firmware 1.0.0 and later can update itself; test builds ("build 8") and unknown can't.
export const canUpdate = (fw: string | null | undefined) => !!fw && !!parse(fw);

export type Offer = { release: Release; now: boolean; why: 'newer' | 'revert' | 'asked' };

// What to offer a calendar reporting `fw`. Newer versions go out on the next wake when the
// channel is automatic; an OLDER target is an emergency revert and always goes out; "Update now"
// on the dashboard (updateNowAt within the last hour) sends a pending one straight away.
export function offerFor(fw: string | null, channel: Channel, updateNowAt: number | null, nowSec: number): Offer | null {
	if (!canUpdate(fw)) return null;
	const t = targetFor(channel);
	if (!t || t.version === fw) return null;
	const asked = !!updateNowAt && nowSec - updateNowAt < 3600;
	const cmp = compareVersions(t.version, fw!);
	if (cmp < 0) return { release: t, now: asked, why: 'revert' };
	if (asked) return { release: t, now: true, why: 'asked' };
	if (t.auto) return { release: t, now: false, why: 'newer' };
	return null;
}

export function offerHeaders(o: Offer | null, origin: string): Record<string, string> {
	if (!o) return {};
	return {
		'X-Update': o.release.version,
		'X-Update-Url': `${origin}/fw/${o.release.version}.bin`,
		'X-Update-Size': String(o.release.size),
		'X-Update-Sha256': o.release.sha256,
		'X-Update-Sig': o.release.sig,
		'X-Update-Now': o.now ? '1' : '0',
	};
}

// For the dashboard: is there a version this calendar could move to?
export function availableFor(fw: string | null, channel: Channel): Release | null {
	if (!canUpdate(fw)) return null;
	const t = targetFor(channel);
	return t && t.version !== fw ? t : null;
}

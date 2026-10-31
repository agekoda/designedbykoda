// Rough LiPo charge level from the cell voltage the calendar reports. It is an
// estimate: the real curve moves a little with load and temperature.
const CURVE: [number, number][] = [
	[4.2, 100], [4.15, 95], [4.11, 90], [4.08, 85], [4.02, 75], [3.98, 65], [3.92, 55],
	[3.87, 45], [3.84, 35], [3.79, 25], [3.73, 15], [3.67, 8], [3.5, 3], [3.3, 0],
];
export function batteryPercent(v: number): number {
	if (v >= CURVE[0][0]) return 100;
	if (v <= CURVE[CURVE.length - 1][0]) return 0;
	for (let i = 1; i < CURVE.length; i++) {
		const [v1, p1] = CURVE[i - 1];
		const [v2, p2] = CURVE[i];
		if (v >= v2) return Math.round(p2 + ((v - v2) / (v1 - v2)) * (p1 - p2));
	}
	return 0;
}

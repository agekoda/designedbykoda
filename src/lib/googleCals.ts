// Saved in selected_calendar_ids as ["-"]: this calendar reads no Google calendars at all, only
// school timetables and other calendar links or files. (An empty list still means "primary",
// as it always has.)
export const NO_GOOGLE = '-';
export const noGoogle = (ids: unknown) => Array.isArray(ids) && ids.length === 1 && ids[0] === NO_GOOGLE;

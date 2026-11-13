// MyPost Business "Import CSV" file, using AusPost's domestic + international template
// (order-import-international-template.xlsx). Column names must stay exactly as AusPost has them.
// Field rules: auspost.com.au/business/shipping/mypost-business/sending-parcels-online-csv-upload
import { SHIPPING_FX } from '../data/preorderPricing';
import { orderNumber } from './orders';

// The boxed calendar. Change these to the real packed size and weight before the first import.
export const PARCEL = {
	lengthCm: 20,
	widthCm: 16,
	heightCm: 8,
	weightKg: 0.5,
	description: 'E-Ink Calendar', // Item Description and customs description (max 40)
	sku: 'EINK-CAL-42',
	hsTariff: '852859', // customs code: check this with AusPost's HS lookup before the first international send
	origin: 'AU',
};

export const HEADERS = [
	'Send From Name', 'Send From Business Name', 'Send From Address Line 1', 'Send From Address Line 2', 'Send From Address Line 3',
	'Send From Suburb', 'Send From State', 'Send From Postcode', 'Send From Phone Number', 'Send From Email Address',
	'Deliver To Name', 'Deliver To Business Name', 'Deliver To Country', 'Deliver To Address Line 1', 'Deliver To Address Line 2',
	'Deliver To Address Line 3', 'Deliver To Suburb', 'Deliver To State', 'Deliver To Postcode', 'Deliver To Phone Number',
	'Deliver To Email Address', 'Item Packaging Type', 'Item Delivery Service', 'Item Description', 'Item Length', 'Item Width',
	'Item Height', 'Item Weight', 'Item Dangerous Goods Flag', 'Schedule 8 or medicinal cannabis', 'Signature On Delivery',
	'Extra Cover Amount', 'Cannot Be Delivered - Return To Sender / Abandon Parcel', 'Customs Declaration - Commercial Value',
	'Customs Declaration - Reason For Export', 'Customs Declaration - Why Are You Exporting These Goods', 'Export Declaration Number',
	'SMS Tracking Notifications', 'SMS Tracking Mobile Phone',
	...[1, 2, 3, 4].flatMap((n) =>
		['Description', 'Weight', 'Value', 'Quantity', 'Country Of Origin', 'HS Tariff', 'SKU'].map((f) => `Parcel${n === 1 ? '' : ' ' + n} Contents - ${f}`)
	),
	'Send Tracking Notifications', 'Additional Label Information 1', 'Delivery Instructions', 'Comments', 'Landed Costs Payer',
	"Sender's Customs Reference", "Importer's Reference Number", 'Licence Numbers', 'Certificate Numbers', 'Invoice Numbers',
];

// SHIP_FROM secret: Name|Address line 1|Suburb|State|Postcode|Phone   (phone optional)
export function shipFrom(env: any) {
	const [name = '', line1 = '', suburb = '', state = '', postcode = '', phone = ''] = String(env.SHIP_FROM ?? '').split('|').map((s) => s.trim());
	return { name, line1, suburb, state: state.toUpperCase(), postcode, phone: phone.replace(/\D/g, '') };
}

const cut = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

function phoneDigits(p: string, country: string) {
	let d = String(p ?? '').replace(/\D/g, '');
	if (country === 'AU' && d.startsWith('61') && d.length === 11) d = '0' + d.slice(2);
	return d.length >= 10 && d.length <= 20 ? d : '';
}

// Customs value in whole AUD, worked out from what they paid for the calendar (not shipping).
function valueAud(o: any) {
	const cur = String(o.currency ?? 'aud').toUpperCase();
	const fx = SHIPPING_FX[cur] ?? 1;
	const item = ((o.amount_total ?? 0) - (o.shipping_amount ?? 0)) / 100;
	return Math.max(1, Math.round(item / fx));
}

export function rowFor(o: any, env: any): string[] {
	let a: any = {};
	try {
		a = o.address_json ? JSON.parse(o.address_json) : {};
	} catch {}
	const from = shipFrom(env);
	const country = String(o.country || a.country || 'AU').toUpperCase();
	const au = country === 'AU';
	const state = au ? String(a.state ?? '').toUpperCase() : cut(a.state, 30);
	const r: Record<string, string> = {
		'Send From Name': cut(from.name, 35),
		'Send From Business Name': 'designedbykoda',
		'Send From Address Line 1': cut(from.line1, 40),
		'Send From Suburb': cut(from.suburb, 30),
		'Send From State': from.state,
		'Send From Postcode': from.postcode,
		'Send From Phone Number': from.phone,
		'Deliver To Name': cut(o.name, 35),
		'Deliver To Country': country,
		'Deliver To Address Line 1': cut(a.line1, 40),
		'Deliver To Address Line 2': cut(a.line2, 40),
		'Deliver To Suburb': cut(a.city, 40),
		'Deliver To State': au && !AU_STATES.includes(state) ? '' : state,
		'Deliver To Postcode': cut(a.postal_code, au ? 4 : 10),
		'Deliver To Phone Number': phoneDigits(o.phone, country),
		'Deliver To Email Address': o.email && String(o.email).length <= 50 ? o.email : '',
		'Item Packaging Type': 'OWN_PACKAGING',
		'Item Delivery Service': au ? 'PP' : 'STD',
		'Item Description': PARCEL.description,
		'Item Length': PARCEL.lengthCm.toFixed(1),
		'Item Width': PARCEL.widthCm.toFixed(1),
		'Item Height': PARCEL.heightCm.toFixed(1),
		'Item Weight': String(PARCEL.weightKg),
		'Item Dangerous Goods Flag': 'NO',
		'Schedule 8 or medicinal cannabis': au ? 'NO' : '',
		'Signature On Delivery': 'NO',
		'Send Tracking Notifications': o.email ? 'YES' : 'NO',
		Comments: `Order ${orderNumber(o.id)}`,
	};
	if (!au) {
		Object.assign(r, {
			'Cannot Be Delivered - Return To Sender / Abandon Parcel': 'RETURN',
			'Customs Declaration - Commercial Value': 'NO',
			'Customs Declaration - Reason For Export': 'SALE_OF_GOODS',
			'Parcel Contents - Description': PARCEL.description,
			'Parcel Contents - Weight': String(PARCEL.weightKg),
			'Parcel Contents - Value': String(valueAud(o)),
			'Parcel Contents - Quantity': '1',
			'Parcel Contents - Country Of Origin': PARCEL.origin,
			'Parcel Contents - HS Tariff': PARCEL.hsTariff,
			'Parcel Contents - SKU': PARCEL.sku,
			'Invoice Numbers': orderNumber(o.id),
		});
	}
	return HEADERS.map((h) => r[h] ?? '');
}

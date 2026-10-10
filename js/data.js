// All product data below is taken from cityroyalty.in (product pages, JSON-LD, homepage).
// Most jackets are listed on the live store with a 0.00 price (enquiry/variant based),
// so `price: null` renders as "Enquire for price" instead of an invented number.

const BASE = 'https://cityroyalty.in';
const DESC =
  'The expertly constructed Leather Jacket is ideal on the go for a Bike Ride or an Outing. ' +
  'Fitted with a padded thin fibre layer to provide safety and maintain body temperature, with brass zippered ' +
  'pockets that keep contents secure plus interior slip pockets that help organise your smaller essentials. ' +
  'Exclusive finger bridges make the snap closures a breeze — the perfect jacket for work or a weekend getaway, in a Royal Unmatched Look.';

export const SALE_ENDS = '2026-12-31T23:59:59+05:30';

export const products = [
  {
    id: 'biker-brown',
    name: "Men's Brown Leather Biker Jacket",
    short: 'Brown Biker',
    sku: 'BIKBRNJK4',
    category: "Men's Jacket",
    price: 13999,
    was: 18999,
    sizes: ['S (42)', 'M (44)', 'L (46)', 'XL (48)', 'XXL (50)'],
    color: '#4a2716',
    rough: 0.0,
    image: 'assets/img/BIKBRNJK4-Mens-Brown-Leather-Biker-Jacket-3.jpg',
    gallery: [
      'assets/img/BIKBRNJK4-Mens-Brown-Leather-Biker-Jacket-2.jpg',
      'assets/img/BIKBRNJK4-Mens-Brown-Leather-Biker-Jacket-6.jpg',
    ],
    url: `${BASE}/product/mens-brown-leather-biker-jacket/`,
    desc: DESC,
  },
  {
    id: 'offwhite',
    name: "Solid Off White Women's Leather Jacket",
    short: 'Off White',
    sku: 'OFFWTWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#d8d0bd',
    rough: 0.0,
    image: 'assets/img/OFFWTWJK1-Solid-Off-White-Womens-Leather-Jacket-1.jpg',
    gallery: ['assets/img/OFFWTWJK1-Solid-Off-White-Womens-Leather-Jacket-2.jpg', 'assets/img/OFFWTWJK1-Solid-Off-White-Womens-Leather-Jacket-6.jpg'],
    url: `${BASE}/product/solid-off-white-womens-leather-jacket/`,
    desc: DESC,
  },
  {
    id: 'darkblue',
    name: "Solid Dark Blue Women's Leather Jacket",
    short: 'Dark Blue',
    sku: 'DBLUWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#16254a',
    rough: 0.0,
    image: 'assets/img/DBLUWJK1-Solid-Dark-Blue-Womens-Leather-Jacket-3.jpg',
    gallery: ['assets/img/DBLUWJK1-Solid-Dark-Blue-Womens-Leather-Jacket-5.jpg', 'assets/img/DBLUWJK1-Solid-Dark-Blue-Womens-Leather-Jacket-4-Copy.jpg'],
    url: `${BASE}/product/solid-dark-blue-womens-leather-jacket-2/`,
    desc: DESC,
  },
  {
    id: 'maroon',
    name: "Maroon Women's Leather Jacket",
    short: 'Maroon',
    sku: 'MRWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#5c1522',
    rough: 0.0,
    image: 'assets/img/MRWJK1-Maroon-Womens-Leather-Jacket-1.jpg',
    gallery: ['assets/img/MRWJK1-Maroon-Womens-Leather-Jacket-3.jpg', 'assets/img/MRWJK1-Maroon-Womens-Leather-Jacket-4.jpg'],
    url: `${BASE}/product/maroon-womens-leather-jacket-2/`,
    desc: DESC,
  },
  {
    id: 'chocolate',
    name: "Chocolate Women's Leather Jacket",
    short: 'Chocolate',
    sku: 'CHWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#3b2014',
    rough: 0.0,
    image: 'assets/img/CHWJK1-Chocolate-Womens-Leather-Jacket-4.jpg',
    gallery: ['assets/img/CHWJK1-Chocolate-Womens-Leather-Jacket-3.jpg', 'assets/img/CHWJK1-Chocolate-Womens-Leather-Jacket-5.jpg'],
    url: `${BASE}/product/chocolate-womens-leather-jacket/`,
    desc: DESC,
  },
  {
    id: 'turquoise',
    name: "Turquoise Blue Women's Leather Jacket",
    short: 'Turquoise',
    sku: 'TBLUWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#1f9aa6',
    rough: 0.0,
    image: 'assets/img/TBLUWJK1-Turquoise-Blue-Womens-Leather-Jacket-5.jpg',
    gallery: ['assets/img/TBLUWJK1-Turquoise-Blue-Womens-Leather-Jacket-1.jpg', 'assets/img/TBLUWJK1-Turquoise-Blue-Womens-Leather-Jacket-7.jpg'],
    url: `${BASE}/product/turquoise-blue-womens-leather-jacket-2/`,
    desc: DESC,
  },
  {
    id: 'blue',
    name: "Blue Women's Leather Jacket",
    short: 'Blue',
    sku: 'BLUWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#1d4a9a',
    rough: 0.0,
    image: 'assets/img/BLUWJK1-Blue-Womens-Leather-Jacket-2.jpg',
    gallery: ['assets/img/BLUWJK1-Blue-Womens-Leather-Jacket-3.jpg', 'assets/img/BLUWJK1-Blue-Womens-Leather-Jacket-4.jpg'],
    url: `${BASE}/product/blue-womens-leather-jacket/`,
    desc: DESC,
  },
  {
    id: 'roughbrown',
    name: "Rough Brown Women's Leather Jacket",
    short: 'Rough Brown',
    sku: 'RFBRWJK1',
    category: "Women's Jacket",
    price: null,
    color: '#6d4424',
    rough: 1.0,
    image: 'assets/img/RFBRWJK1-Rough-Brown-Womens-Leather-Jacket-1.jpg',
    gallery: ['assets/img/RFBRWJK1-Rough-Brown-Womens-Leather-Jacket-5.jpg', 'assets/img/RFBRWJK1-Rough-Brown-Womens-Leather-Jacket-6.jpg'],
    url: `${BASE}/product/rough-brown-womens-leather-jacket/`,
    desc: DESC,
  },
  {
    id: 'roughblack',
    name: "Rough Black Women's Leather Jacket",
    short: 'Rough Black',
    sku: 'RFBLWJK',
    category: "Women's Jacket",
    price: null,
    color: '#151515',
    rough: 1.0,
    image: 'assets/img/RFBLWJK1-Rough-Black-Womens-Leather-Jacket-1.jpg',
    gallery: ['assets/img/RFBLWJK1-Rough-Black-Womens-Leather-Jacket-2.jpg', 'assets/img/RFBLWJK1-Rough-Black-Womens-Leather-Jacket-3.jpg'],
    url: `${BASE}/product/rough-black-womens-leather-jacket/`,
    desc: DESC,
  },
];

// Not a jacket (so it is not a colour in the configurator) but part of the live "Best Products" row.
export const belt = {
  id: 'belt-tan',
  name: 'Dark Wrinkled Tan Leather Belt',
  category: 'Belts',
  price: null,
  image: 'assets/img/IMG_6027.jpg',
  url: `${BASE}/product/dark-wrinkled-tan-leather-belt-2/`,
};

export const categories = [
  { name: "Men's Jacket", blurb: 'Biker & classic cuts', img: 'assets/img/BIKBRNJK4-Mens-Brown-Leather-Biker-Jacket-3.jpg', pos: '50% 22%', url: `${BASE}/product-category/jacket/mens-jacket/` },
  { name: "Women's Jacket", blurb: 'Eight colourways', img: 'assets/img/RFBRWJK1-Rough-Brown-Womens-Leather-Jacket-1.jpg', pos: '50% 30%', url: `${BASE}/product-category/jacket/womens-jacket/` },
  { name: 'Leather Bags', blurb: 'Carry your essentials', img: 'assets/img/duffle-bag.png', url: `${BASE}/product-category/leather-bags/` },
  { name: 'Belts', blurb: 'Hand-finished leather', img: 'assets/img/menu-belts.webp', url: `${BASE}/product-category/belts/` },
  { name: 'Wallets', blurb: 'Pocket-sized royalty', img: null, url: `${BASE}/product-category/leather-wallet/` },
  { name: 'Jewellery', blurb: 'Finishing touches', img: null, url: `${BASE}/product-category/jewellery/` },
];

export const links = {
  shop: `${BASE}/shop-shop-wooshop-v2/`,
  about: `${BASE}/about-us-2/`,
  contact: `${BASE}/contact-us-2/`,
  account: `${BASE}/my-account/`,
  track: `${BASE}/my-account/orders/`,
  privacy: `${BASE}/privacy-policy/`,
  refund: `${BASE}/refund_returns/`,
  maps: 'https://maps.app.goo.gl/U2CwtnYYHcnNVV1p9',
  facebook: 'https://www.facebook.com/CITYROYALTY',
  instagram: 'https://www.instagram.com/cityroyalty.official',
};

export const formatINR = (n) => '₹' + n.toLocaleString('en-IN');

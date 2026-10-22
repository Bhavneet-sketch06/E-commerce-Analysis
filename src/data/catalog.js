// Product catalogue for "Parvaaz Bazaar", a fictional Punjab-based e-commerce platform.
// marginPct = gross margin before any discount. A discount can never eat the whole margin
// (see rules.margin.minMarginAfterDiscountPct).

export const CATEGORIES = {
  Fashion: {
    emoji: '👗', marginPct: 45, returnRate: 0.22, price: [499, 2999],
    products: ['Phulkari Dupatta', 'Punjabi Jutti', 'Cotton Kurta Set', 'Denim Jacket', 'Silk Saree', 'Woollen Shawl'],
  },
  Electronics: {
    emoji: '📱', marginPct: 12, returnRate: 0.08, price: [999, 34999],
    products: ['Bluetooth Earbuds', 'Smartwatch', 'Power Bank 20000mAh', 'Android Phone', 'Mixer Grinder Smart', 'LED Monitor'],
  },
  'Home & Kitchen': {
    emoji: '🏠', marginPct: 30, returnRate: 0.06, price: [299, 4999],
    products: ['Pressure Cooker 5L', 'Steel Dinner Set', 'Diwali Diya Pack', 'Cotton Bedsheet', 'Air Fryer', 'Wall Clock'],
  },
  Beauty: {
    emoji: '💄', marginPct: 50, returnRate: 0.04, price: [199, 1999],
    products: ['Kumkumadi Face Oil', 'Lipstick Trio', 'Hair Serum', 'Sunscreen SPF50', 'Beard Kit', 'Mehendi Cones'],
  },
  Grocery: {
    emoji: '🛒', marginPct: 15, returnRate: 0.01, price: [99, 999],
    products: ['Basmati Rice 5kg', 'Desi Ghee 1L', 'Dry Fruits Gift Box', 'Masala Chai Pack', 'Pinni Sweets', 'Mustard Oil 1L'],
  },
  Sports: {
    emoji: '🏏', marginPct: 35, returnRate: 0.09, price: [399, 5999],
    products: ['Cricket Bat (Kashmir Willow)', 'Yoga Mat', 'Running Shoes', 'Badminton Racquet', 'Dumbbell Set', 'Cycling Gloves'],
  },
  Books: {
    emoji: '📚', marginPct: 25, returnRate: 0.03, price: [99, 899],
    products: ['UPSC Prep Guide', 'Punjabi Novel', 'Kids Story Set', 'Notebook Pack', 'Python Programming', 'Gurmukhi Workbook'],
  },
  Toys: {
    emoji: '🧸', marginPct: 40, returnRate: 0.05, price: [299, 2999],
    products: ['Building Blocks', 'Remote Car', 'Board Game Ludo King', 'Soft Teddy', 'Science Kit', 'Doll House'],
  },
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES);

// Month-of-year demand multipliers (Jan = index 0) for an Indian e-commerce platform:
// Jan/Jul end-of-season sales, Sep-Nov festive season (Navratri, Dussehra, Diwali), Nov-Feb weddings.
export const SEASONALITY = [1.0, 0.85, 0.9, 0.8, 0.85, 0.8, 1.05, 0.9, 1.15, 1.6, 1.5, 1.1];

export const CITIES = [
  ['Ludhiana', 14], ['Amritsar', 10], ['Jalandhar', 9], ['Patiala', 7], ['Mohali', 6], ['Bathinda', 5],
  ['Chandigarh', 9], ['Hoshiarpur', 3], ['Pathankot', 2], ['Moga', 2], ['Delhi', 12], ['Bengaluru', 6],
  ['Gurugram', 5], ['Jaipur', 3], ['Pune', 3],
];

export const FIRST_NAMES = [
  'Harpreet', 'Gurpreet', 'Simran', 'Amandeep', 'Jaspreet', 'Manpreet', 'Navneet', 'Rajveer', 'Kiranjot', 'Arshdeep',
  'Bhavneet', 'Ishaan', 'Ananya', 'Rohan', 'Priya', 'Karan', 'Neha', 'Aarav', 'Diya', 'Vikram', 'Sukhmani', 'Tejinder',
  'Mehak', 'Parth', 'Riya', 'Sahil', 'Tanvi', 'Yuvraj', 'Jasleen', 'Gagandeep', 'Harleen', 'Kabir', 'Aditi', 'Arjun',
  'Pooja', 'Rahul', 'Sneha', 'Varun', 'Nimrat', 'Ekam', 'Japji', 'Mohit', 'Sakshi', 'Deepak', 'Komal', 'Lovepreet',
];

export const LAST_NAMES = [
  'Singh', 'Kaur', 'Sandhu', 'Gill', 'Dhillon', 'Sidhu', 'Grewal', 'Brar', 'Bajwa', 'Sharma', 'Verma', 'Gupta',
  'Arora', 'Malhotra', 'Kapoor', 'Chopra', 'Bhatia', 'Sethi', 'Khanna', 'Mehta', 'Aggarwal', 'Bansal', 'Saini',
];

// 1 reward point = ₹0.25. Points earned: 1 per ₹100 spent; expire 12 months after earning.
export const POINT_VALUE_INR = 0.25;
export const SHIPPING_COST_INR = 49;
export const FREE_SHIPPING_THRESHOLD_INR = 499;

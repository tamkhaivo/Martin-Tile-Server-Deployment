// ============================================================
// STATE FIPS  (name -> 2-digit code)
// ============================================================
export const STATE_FIPS = {
    "Alabama": "01", "Alaska": "02", "Arizona": "04", "Arkansas": "05", "California": "06",
    "Colorado": "08", "Connecticut": "09", "Delaware": "10", "Florida": "12", "Georgia": "13",
    "Hawaii": "15", "Idaho": "16", "Illinois": "17", "Indiana": "18", "Iowa": "19",
    "Kansas": "20", "Kentucky": "21", "Louisiana": "22", "Maine": "23", "Maryland": "24",
    "Massachusetts": "25", "Michigan": "26", "Minnesota": "27", "Mississippi": "28", "Missouri": "29",
    "Montana": "30", "Nebraska": "31", "Nevada": "32", "New Hampshire": "33", "New Jersey": "34",
    "New Mexico": "35", "New York": "36", "North Carolina": "37", "North Dakota": "38", "Ohio": "39",
    "Oklahoma": "40", "Oregon": "41", "Pennsylvania": "42", "Rhode Island": "44", "South Carolina": "45",
    "South Dakota": "46", "Tennessee": "47", "Texas": "48", "Utah": "49", "Vermont": "50",
    "Virginia": "51", "Washington": "53", "West Virginia": "54", "Wisconsin": "55", "Wyoming": "56"
};

export const FIPS_TO_STATE = Object.fromEntries(Object.entries(STATE_FIPS).map(([k, v]) => [v, k]));

export const FIPS_TO_ABBR = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA",
    "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ",
    "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC",
    "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY"
};

// State population factors (approx relative weights)
export const STATE_POP = {
    "01": 5, "02": 1, "04": 7, "05": 3, "06": 39, "08": 6, "09": 4, "10": 1, "12": 22, "13": 11,
    "15": 1, "16": 2, "17": 13, "18": 7, "19": 3, "20": 3, "21": 4, "22": 5, "23": 1, "24": 6,
    "25": 7, "26": 10, "27": 6, "28": 3, "29": 6, "30": 1, "31": 2, "32": 3, "33": 1, "34": 9,
    "35": 2, "36": 20, "37": 10, "38": 1, "39": 12, "40": 4, "41": 4, "42": 13, "44": 1, "45": 5,
    "46": 1, "47": 7, "48": 29, "49": 3, "50": 1, "51": 9, "53": 8, "54": 2, "55": 6, "56": 1
};

export const MARTIN_URL = window.location.port === '8080'
    ? `${window.location.protocol}//${window.location.hostname}:8080/tiles`
    : 'http://localhost:3000';

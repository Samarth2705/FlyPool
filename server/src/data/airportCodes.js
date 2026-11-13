// Airports a flight into Mumbai / Navi Mumbai commonly departs from - used
// only to READ the departure airport off a ticket (ticketAnalysis.js).
// Codes are IATA; city names map to the city's main airport. Not exhaustive:
// an airport that isn't listed is simply "not found" (shown as such), it is
// never guessed.
export const AIRPORT_CODES = {
  // India
  BOM: 'Mumbai', NMI: 'Navi Mumbai', DEL: 'Delhi', BLR: 'Bengaluru', MAA: 'Chennai', HYD: 'Hyderabad',
  CCU: 'Kolkata', GOI: 'Goa (Dabolim)', GOX: 'Goa (Mopa)', COK: 'Kochi', AMD: 'Ahmedabad', PNQ: 'Pune',
  JAI: 'Jaipur', LKO: 'Lucknow', PAT: 'Patna', IXC: 'Chandigarh', SXR: 'Srinagar', IXB: 'Bagdogra',
  GAU: 'Guwahati', BBI: 'Bhubaneswar', TRV: 'Thiruvananthapuram', IXE: 'Mangaluru', IXM: 'Madurai',
  CJB: 'Coimbatore', NAG: 'Nagpur', IDR: 'Indore', BHO: 'Bhopal', VNS: 'Varanasi', IXR: 'Ranchi',
  RPR: 'Raipur', VTZ: 'Visakhapatnam', IXZ: 'Port Blair', ATQ: 'Amritsar', IXJ: 'Jammu', UDR: 'Udaipur',
  JDH: 'Jodhpur', STV: 'Surat', BDQ: 'Vadodara', IXA: 'Agartala', DED: 'Dehradun', VGA: 'Vijayawada',
  TIR: 'Tirupati', HBX: 'Hubballi', IXG: 'Belagavi', CCJ: 'Kozhikode', CNN: 'Kannur', RAJ: 'Rajkot',
  // International
  DXB: 'Dubai', AUH: 'Abu Dhabi', SHJ: 'Sharjah', DOH: 'Doha', MCT: 'Muscat', BAH: 'Bahrain', KWI: 'Kuwait',
  RUH: 'Riyadh', JED: 'Jeddah', SIN: 'Singapore', KUL: 'Kuala Lumpur', BKK: 'Bangkok', HKG: 'Hong Kong',
  LHR: 'London Heathrow', FRA: 'Frankfurt', CDG: 'Paris', AMS: 'Amsterdam', IST: 'Istanbul', ZRH: 'Zurich',
  JFK: 'New York JFK', EWR: 'Newark', SFO: 'San Francisco', ORD: 'Chicago', YYZ: 'Toronto',
  SYD: 'Sydney', MEL: 'Melbourne', NRT: 'Tokyo Narita', CMB: 'Colombo', KTM: 'Kathmandu', DAC: 'Dhaka', MLE: 'Malé',
};

// City names as printed on tickets -> code (unambiguous ones only)
export const CITY_CODES = {
  'NAVI MUMBAI': 'NMI', MUMBAI: 'BOM', BOMBAY: 'BOM', 'NEW DELHI': 'DEL', DELHI: 'DEL', BENGALURU: 'BLR', BANGALORE: 'BLR',
  CHENNAI: 'MAA', MADRAS: 'MAA', HYDERABAD: 'HYD', KOLKATA: 'CCU', CALCUTTA: 'CCU', KOCHI: 'COK', COCHIN: 'COK',
  AHMEDABAD: 'AMD', PUNE: 'PNQ', JAIPUR: 'JAI', LUCKNOW: 'LKO', PATNA: 'PAT', CHANDIGARH: 'IXC', SRINAGAR: 'SXR',
  GUWAHATI: 'GAU', BHUBANESWAR: 'BBI', THIRUVANANTHAPURAM: 'TRV', MANGALURU: 'IXE', MANGALORE: 'IXE', MADURAI: 'IXM',
  COIMBATORE: 'CJB', NAGPUR: 'NAG', INDORE: 'IDR', BHOPAL: 'BHO', VARANASI: 'VNS', RANCHI: 'IXR', RAIPUR: 'RPR',
  VISAKHAPATNAM: 'VTZ', AMRITSAR: 'ATQ', UDAIPUR: 'UDR', JODHPUR: 'JDH', SURAT: 'STV', VADODARA: 'BDQ',
  DEHRADUN: 'DED', DUBAI: 'DXB', 'ABU DHABI': 'AUH', SHARJAH: 'SHJ', DOHA: 'DOH', MUSCAT: 'MCT', SINGAPORE: 'SIN',
  'KUALA LUMPUR': 'KUL', BANGKOK: 'BKK', 'HONG KONG': 'HKG', COLOMBO: 'CMB', KATHMANDU: 'KTM', DHAKA: 'DAC',
};

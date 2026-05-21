const geoip = require('geoip-lite');


const cityMap = {
  Hsinchu: '新竹',
  Taipei: '台北',
  NewTaipei: '新北',
  'New Taipei': '新北',
  Taoyuan: '桃园',
  Taichung: '台中',
  Tainan: '台南',
  Kaohsiung: '高雄',
  Keelung: '基隆',
  Chiayi: '嘉义',
  Miaoli: '苗栗',
  Changhua: '彰化',
  Nantou: '南投',
  Yunlin: '云林',
  Pingtung: '屏东',
  Yilan: '宜兰',
  Hualien: '花莲',
  Taitung: '台东',
  Penghu: '澎湖',
};

const countryMap = {
  CN: '中国',
  US: '美国',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  HK: '中国香港',
  MO: '中国澳门',
  TW: '中国台湾',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  CA: '加拿大',
  AU: '澳大利亚',
};

const chinaRegionMap = {
  11: '北京',
  12: '天津',
  13: '河北',
  14: '山西',
  15: '内蒙古',
  21: '辽宁',
  22: '吉林',
  23: '黑龙江',
  31: '上海',
  32: '江苏',
  33: '浙江',
  34: '安徽',
  35: '福建',
  36: '江西',
  37: '山东',
  41: '河南',
  42: '湖北',
  43: '湖南',
  44: '广东',
  45: '广西',
  46: '海南',
  50: '重庆',
  51: '四川',
  52: '贵州',
  53: '云南',
  54: '西藏',
  61: '陕西',
  62: '甘肃',
  63: '青海',
  64: '宁夏',
  65: '新疆',
  71: '台湾',
  81: '香港',
  82: '澳门',
};

function getIpLocation(ip) {
  if (!ip) return '未知地区';

  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.')
  ) {
    return '本地网络';
  }

  const info = geoip.lookup(ip);

  if (!info) return '未知地区';

  const country = countryMap[info.country] || info.country || '未知国家';

  if (info.country === 'CN') {
    const region = chinaRegionMap[info.region] || info.region || '';
    return region ? `${region} / ${country}` : country;
  }

  const city = cityMap[info.city] || info.city || '';
  const region = info.region || '';

  if (city && country) return `${city} / ${country}`;
  if (region && country) return `${region} / ${country}`;

  return country;
}

module.exports = {
  getIpLocation,
};

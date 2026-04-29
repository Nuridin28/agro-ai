// Auto-generated from Giprozem MapServer (172 feature layers).
// Каждый слой ≈ один район РК. extent в EPSG:4326 ([west, south, east, north]).

export interface GiprozemLayer {
  id: number;          // ArcGIS layer id (используется в URL)
  name: string;        // ah_NN_MMM
  oblastCode: string;  // NN
  rayonCode: string;   // MMM
  bbox: [number, number, number, number];
  centroid: [number, number]; // [lat, lng]
}

export const OBLAST_NAMES: Record<string, string> = {
  "01": "Акмолинская обл.",
  "02": "Актюбинская обл.",
  "03": "Алматинская обл.",
  "04": "Атырауская обл.",
  "05": "Восточно-Казахстанская обл.",
  "06": "Жамбылская обл.",
  "08": "Западно-Казахстанская обл.",
  "09": "Карагандинская обл.",
  "10": "Кызылординская обл.",
  "12": "Костанайская обл.",
  "13": "Мангистауская обл.",
  "14": "Павлодарская обл.",
  "15": "Северо-Казахстанская обл.",
  "19": "Туркестанская обл.",
  "23": "Область Абай",
  "24": "Область Жетысу",
  "25": "Область Улытау",
};

export const GIPROZEM_LAYERS: GiprozemLayer[] = [
  { id: 17, name: "ah_01_001", oblastCode: "01", rayonCode: "001", bbox: [70.1421, 51.7734, 72.685, 52.5201], centroid: [52.1468, 71.4135] },
  { id: 16, name: "ah_01_002", oblastCode: "01", rayonCode: "002", bbox: [68.9247, 51.0341, 70.4365, 52.0343], centroid: [51.5342, 69.6806] },
  { id: 15, name: "ah_01_003", oblastCode: "01", rayonCode: "003", bbox: [67.8714, 50.7458, 69.2631, 52.2112], centroid: [51.4785, 68.5673] },
  { id: 13, name: "ah_01_004", oblastCode: "01", rayonCode: "004", bbox: [67.7031, 51.9921, 69.4878, 52.8139], centroid: [52.403, 68.5954] },
  { id: 25, name: "ah_01_005", oblastCode: "01", rayonCode: "005", bbox: [71.6692, 50.423, 73.14, 51.3808], centroid: [50.9019, 72.4046] },
  { id: 12, name: "ah_01_006", oblastCode: "01", rayonCode: "006", bbox: [71.9719, 50.9924, 73.9208, 52.4396], centroid: [51.716, 72.9464] },
  { id: 11, name: "ah_01_007", oblastCode: "01", rayonCode: "007", bbox: [68.5785, 50.6135, 70.2047, 51.3711], centroid: [50.9923, 69.3916] },
  { id: 10, name: "ah_01_008", oblastCode: "01", rayonCode: "008", bbox: [69.5647, 50.0799, 70.8237, 51.1109], centroid: [50.5954, 70.1942] },
  { id: 9, name: "ah_01_009", oblastCode: "01", rayonCode: "009", bbox: [69.1958, 51.8423, 71.0261, 52.7046], centroid: [52.2734, 70.1109] },
  { id: 8, name: "ah_01_011", oblastCode: "01", rayonCode: "011", bbox: [70.3473, 50.4685, 72.0211, 51.6257], centroid: [51.0471, 71.1842] },
  { id: 7, name: "ah_01_012", oblastCode: "01", rayonCode: "012", bbox: [69.9364, 51.4094, 71.8611, 51.8367], centroid: [51.623, 70.8988] },
  { id: 6, name: "ah_01_160", oblastCode: "01", rayonCode: "160", bbox: [68.5669, 52.5607, 70.0162, 53.6796], centroid: [53.1201, 69.2915] },
  { id: 5, name: "ah_01_171", oblastCode: "01", rayonCode: "171", bbox: [69.328, 52.4033, 70.8901, 53.4122], centroid: [52.9078, 70.1091] },
  { id: 4, name: "ah_01_172", oblastCode: "01", rayonCode: "172", bbox: [70.4243, 52.3173, 72.7147, 53.4287], centroid: [52.873, 71.5695] },
  { id: 3, name: "ah_01_174", oblastCode: "01", rayonCode: "174", bbox: [68.9951, 53.251, 69.3457, 53.4043], centroid: [53.3277, 69.1704] },
  { id: 2, name: "ah_01_275", oblastCode: "01", rayonCode: "275", bbox: [65.4177, 50.3831, 67.7435, 51.7811], centroid: [51.0821, 66.5806] },
  { id: 1, name: "ah_01_277", oblastCode: "01", rayonCode: "277", bbox: [65.3522, 51.3332, 67.0794, 52.4514], centroid: [51.8923, 66.2158] },
  { id: 0, name: "ah_01_278", oblastCode: "01", rayonCode: "278", bbox: [66.799, 50.9664, 68.071, 52.4286], centroid: [51.6975, 67.435] },
  { id: 84, name: "ah_02_022", oblastCode: "02", rayonCode: "022", bbox: [56.233, 49.6517, 58.2118, 50.3797], centroid: [50.0157, 57.2224] },
  { id: 83, name: "ah_02_024", oblastCode: "02", rayonCode: "024", bbox: [59.8524, 50.2901, 62.2858, 51.3157], centroid: [50.8029, 61.0691] },
  { id: 82, name: "ah_02_027", oblastCode: "02", rayonCode: "027", bbox: [56.6222, 49.0168, 58.1089, 49.7873], centroid: [49.4021, 57.3656] },
  { id: 81, name: "ah_02_028", oblastCode: "02", rayonCode: "028", bbox: [57.2928, 50.486, 58.5802, 51.1372], centroid: [50.8116, 57.9365] },
  { id: 80, name: "ah_02_029", oblastCode: "02", rayonCode: "029", bbox: [56.0154, 50.2148, 57.6899, 51.0887], centroid: [50.6518, 56.8527] },
  { id: 79, name: "ah_02_031", oblastCode: "02", rayonCode: "031", bbox: [56.0899, 49.0779, 57.2532, 49.6765], centroid: [49.3772, 56.6715] },
  { id: 78, name: "ah_02_032", oblastCode: "02", rayonCode: "032", bbox: [53.7422, 49.1279, 55.1267, 49.6048], centroid: [49.3663, 54.4344] },
  { id: 77, name: "ah_02_033", oblastCode: "02", rayonCode: "033", bbox: [54.7768, 49.7728, 56.1667, 50.8701], centroid: [50.3215, 55.4718] },
  { id: 76, name: "ah_02_034", oblastCode: "02", rayonCode: "034", bbox: [57.614, 49.6153, 59.4587, 50.6431], centroid: [50.1292, 58.5363] },
  { id: 75, name: "ah_02_036", oblastCode: "02", rayonCode: "036", bbox: [56.9754, 50.2435, 57.7623, 50.5724], centroid: [50.4079, 57.3689] },
  { id: 24, name: "ah_03_043", oblastCode: "03", rayonCode: "043", bbox: [74.1428, 44.4766, 76.8985, 45.8915], centroid: [45.184, 75.5206] },
  { id: 23, name: "ah_03_044", oblastCode: "03", rayonCode: "044", bbox: [77.1403, 43.338, 78.523, 43.7668], centroid: [43.5524, 77.8317] },
  { id: 37, name: "ah_03_045", oblastCode: "03", rayonCode: "045", bbox: [75.2612, 43.0627, 76.5338, 44.2686], centroid: [43.6656, 75.8975] },
  { id: 36, name: "ah_03_046", oblastCode: "03", rayonCode: "046", bbox: [76.1197, 43.3547, 77.157, 44.1876], centroid: [43.7712, 76.6384] },
  { id: 35, name: "ah_03_047", oblastCode: "03", rayonCode: "047", bbox: [76.2759, 43.07, 76.8118, 43.5985], centroid: [43.3343, 76.5438] },
  { id: 34, name: "ah_03_050", oblastCode: "03", rayonCode: "050", bbox: [78.2796, 42.6655, 80.595, 43.216], centroid: [42.9407, 79.4373] },
  { id: 33, name: "ah_03_051", oblastCode: "03", rayonCode: "051", bbox: [76.9898, 43.2773, 77.3564, 43.7645], centroid: [43.5209, 77.1731] },
  { id: 32, name: "ah_03_052", oblastCode: "03", rayonCode: "052", bbox: [79.2739, 43.2781, 80.7193, 43.8827], centroid: [43.5804, 79.9966] },
  { id: 22, name: "ah_03_055", oblastCode: "03", rayonCode: "055", bbox: [77.2993, 43.8422, 77.843, 44.1473], centroid: [43.9948, 77.5712] },
  { id: 31, name: "ah_03_323", oblastCode: "03", rayonCode: "323", bbox: [78.3033, 42.8303, 79.4746, 43.1348], centroid: [42.9826, 78.889] },
  { id: 166, name: "ah_04_060", oblastCode: "04", rayonCode: "060", bbox: [51.1681, 48.1368, 51.8057, 48.6697], centroid: [48.4032, 51.4869] },
  { id: 165, name: "ah_04_063", oblastCode: "04", rayonCode: "063", bbox: [49.0497, 46.5807, 49.318, 46.6371], centroid: [46.6089, 49.1838] },
  { id: 164, name: "ah_04_065", oblastCode: "04", rayonCode: "065", bbox: [51.4457, 47.2225, 51.8596, 47.9101], centroid: [47.5663, 51.6527] },
  { id: 163, name: "ah_04_066", oblastCode: "04", rayonCode: "066", bbox: [51.7907, 46.9687, 52.1183, 47.4566], centroid: [47.2126, 51.9545] },
  { id: 56, name: "ah_05_068", oblastCode: "05", rayonCode: "068", bbox: [82.0123, 49.9386, 83.047, 50.533], centroid: [50.2358, 82.5297] },
  { id: 55, name: "ah_05_069", oblastCode: "05", rayonCode: "069", bbox: [84.6176, 47.0832, 85.4557, 47.6761], centroid: [47.3797, 85.0367] },
  { id: 44, name: "ah_05_070", oblastCode: "05", rayonCode: "070", bbox: [82.9358, 49.3804, 84.6381, 49.9161], centroid: [49.6482, 83.787] },
  { id: 54, name: "ah_05_071", oblastCode: "05", rayonCode: "071", bbox: [84.2121, 49.1193, 86.6528, 49.6434], centroid: [49.3813, 85.4324] },
  { id: 53, name: "ah_05_072", oblastCode: "05", rayonCode: "072", bbox: [83.4529, 47.9, 86.4942, 48.9478], centroid: [48.4239, 84.9735] },
  { id: 52, name: "ah_05_078", oblastCode: "05", rayonCode: "078", bbox: [83.4904, 47.0121, 84.2981, 47.9081], centroid: [47.4601, 83.8942] },
  { id: 51, name: "ah_05_079", oblastCode: "05", rayonCode: "079", bbox: [81.3373, 49.2596, 83.5521, 50.297], centroid: [49.7783, 82.4447] },
  { id: 50, name: "ah_05_080", oblastCode: "05", rayonCode: "080", bbox: [81.5849, 50.2192, 82.5686, 50.8205], centroid: [50.5198, 82.0767] },
  { id: 43, name: "ah_05_083", oblastCode: "05", rayonCode: "083", bbox: [83.3041, 50.2687, 83.5469, 50.3423], centroid: [50.3055, 83.4255] },
  { id: 42, name: "ah_05_085", oblastCode: "05", rayonCode: "085", bbox: [82.4113, 49.7895, 82.9379, 50.034], centroid: [49.9118, 82.6746] },
  { id: 49, name: "ah_05_334", oblastCode: "05", rayonCode: "334", bbox: [82.7267, 48.6284, 84.1798, 49.4797], centroid: [49.0541, 83.4533] },
  { id: 171, name: "ah_06_087", oblastCode: "06", rayonCode: "087", bbox: [71.3459, 42.913, 71.6894, 43.2013], centroid: [43.0572, 71.5177] },
  { id: 128, name: "ah_06_088", oblastCode: "06", rayonCode: "088", bbox: [70.775, 42.7109, 71.8328, 43.2405], centroid: [42.9757, 71.3039] },
  { id: 127, name: "ah_06_089", oblastCode: "06", rayonCode: "089", bbox: [70.2336, 42.4685, 71.1703, 43.1208], centroid: [42.7946, 70.702] },
  { id: 126, name: "ah_06_090", oblastCode: "06", rayonCode: "090", bbox: [74.0975, 42.7978, 75.753, 43.5693], centroid: [43.1835, 74.9252] },
  { id: 125, name: "ah_06_091", oblastCode: "06", rayonCode: "091", bbox: [71.829, 42.7602, 73.2058, 43.2327], centroid: [42.9964, 72.5174] },
  { id: 124, name: "ah_06_092", oblastCode: "06", rayonCode: "092", bbox: [73.0098, 42.7493, 73.9583, 43.333], centroid: [43.0412, 73.484] },
  { id: 123, name: "ah_06_093", oblastCode: "06", rayonCode: "093", bbox: [72.5439, 43.9476, 73.6413, 44.3962], centroid: [44.1719, 73.0926] },
  { id: 122, name: "ah_06_094", oblastCode: "06", rayonCode: "094", bbox: [69.4336, 43.2981, 70.0056, 43.8163], centroid: [43.5572, 69.7196] },
  { id: 121, name: "ah_06_095", oblastCode: "06", rayonCode: "095", bbox: [69.9145, 42.9426, 71.3152, 44.0089], centroid: [43.4757, 70.6148] },
  { id: 120, name: "ah_06_096", oblastCode: "06", rayonCode: "096", bbox: [73.5315, 43.1866, 74.6691, 44.119], centroid: [43.6528, 74.1003] },
  { id: 119, name: "ah_06_097", oblastCode: "06", rayonCode: "097", bbox: [71.3045, 42.7894, 71.4528, 42.9593], centroid: [42.8743, 71.3787] },
  { id: 74, name: "ah_08_114", oblastCode: "08", rayonCode: "114", bbox: [52.4337, 50.6978, 53.5956, 51.4969], centroid: [51.0974, 53.0146] },
  { id: 73, name: "ah_08_116", oblastCode: "08", rayonCode: "116", bbox: [46.8892, 49.2019, 47.7968, 50.3253], centroid: [49.7636, 47.343] },
  { id: 72, name: "ah_08_118", oblastCode: "08", rayonCode: "118", bbox: [50.2691, 50.6602, 52.4881, 51.7757], centroid: [51.2179, 51.3786] },
  { id: 71, name: "ah_08_119", oblastCode: "08", rayonCode: "119", bbox: [48.8512, 49.5722, 49.2997, 49.915], centroid: [49.7436, 49.0755] },
  { id: 70, name: "ah_08_122", oblastCode: "08", rayonCode: "122", bbox: [51.8392, 50.2771, 53.4978, 50.9387], centroid: [50.6079, 52.6685] },
  { id: 69, name: "ah_08_124", oblastCode: "08", rayonCode: "124", bbox: [49.5147, 50.8208, 50.8472, 51.2834], centroid: [51.0521, 50.181] },
  { id: 68, name: "ah_08_125", oblastCode: "08", rayonCode: "125", bbox: [51.2433, 50.3204, 52.592, 51.3615], centroid: [50.8409, 51.9177] },
  { id: 67, name: "ah_08_127", oblastCode: "08", rayonCode: "127", bbox: [50.598, 49.125, 51.8621, 50.5849], centroid: [49.855, 51.23] },
  { id: 66, name: "ah_08_128", oblastCode: "08", rayonCode: "128", bbox: [53.3045, 50.2518, 54.3477, 51.2148], centroid: [50.7333, 53.8261] },
  { id: 65, name: "ah_08_130", oblastCode: "08", rayonCode: "130", bbox: [50.9677, 51.0451, 51.3172, 51.4657], centroid: [51.2554, 51.1425] },
  { id: 64, name: "ah_09_102", oblastCode: "09", rayonCode: "102", bbox: [74.0957, 48.4864, 74.733, 48.7214], centroid: [48.6039, 74.4144] },
  { id: 61, name: "ah_09_107", oblastCode: "09", rayonCode: "107", bbox: [72.0028, 47.4835, 74.3067, 49.3549], centroid: [48.4192, 73.1547] },
  { id: 60, name: "ah_09_133", oblastCode: "09", rayonCode: "133", bbox: [74.2032, 48.6552, 77.1701, 50.1909], centroid: [49.423, 75.6866] },
  { id: 59, name: "ah_09_134", oblastCode: "09", rayonCode: "134", bbox: [71.5772, 49.283, 73.6996, 49.8184], centroid: [49.5507, 72.6384] },
  { id: 58, name: "ah_09_136", oblastCode: "09", rayonCode: "136", bbox: [70.4639, 49.5371, 71.9779, 50.7527], centroid: [50.1449, 71.2209] },
  { id: 85, name: "ah_09_137", oblastCode: "09", rayonCode: "137", bbox: [71.6534, 49.9193, 74.0457, 51.2312], centroid: [50.5752, 72.8496] },
  { id: 57, name: "ah_09_140", oblastCode: "09", rayonCode: "140", bbox: [72.2804, 49.3959, 75.0217, 50.6195], centroid: [50.0077, 73.6511] },
  { id: 118, name: "ah_10_147", oblastCode: "10", rayonCode: "147", bbox: [61.3225, 45.8133, 62.1331, 46.1682], centroid: [45.9908, 61.7278] },
  { id: 117, name: "ah_10_148", oblastCode: "10", rayonCode: "148", bbox: [64.1992, 44.6605, 64.8315, 45.1653], centroid: [44.9129, 64.5153] },
  { id: 116, name: "ah_10_149", oblastCode: "10", rayonCode: "149", bbox: [66.8017, 43.204, 67.9146, 44.2166], centroid: [43.7103, 67.3582] },
  { id: 115, name: "ah_10_150", oblastCode: "10", rayonCode: "150", bbox: [61.3787, 45.5299, 62.2496, 45.8898], centroid: [45.7098, 61.8141] },
  { id: 114, name: "ah_10_151", oblastCode: "10", rayonCode: "151", bbox: [63.132, 44.9539, 64.3797, 45.4496], centroid: [45.2018, 63.7559] },
  { id: 113, name: "ah_10_153", oblastCode: "10", rayonCode: "153", bbox: [64.6607, 44.3647, 65.9475, 45.1666], centroid: [44.7657, 65.3041] },
  { id: 112, name: "ah_10_154", oblastCode: "10", rayonCode: "154", bbox: [65.9659, 43.9285, 67.1999, 44.6189], centroid: [44.2737, 66.5829] },
  { id: 111, name: "ah_10_156", oblastCode: "10", rayonCode: "156", bbox: [65.2697, 44.7863, 65.7401, 45.0208], centroid: [44.9036, 65.5049] },
  { id: 162, name: "ah_12_178", oblastCode: "12", rayonCode: "178", bbox: [63.9317, 52.7044, 64.9774, 53.5501], centroid: [53.1272, 64.4546] },
  { id: 161, name: "ah_12_179", oblastCode: "12", rayonCode: "179", bbox: [60.0851, 51.5387, 61.7227, 52.5154], centroid: [52.027, 60.9039] },
  { id: 160, name: "ah_12_180", oblastCode: "12", rayonCode: "180", bbox: [61.4355, 50.8526, 63.0158, 52.2525], centroid: [51.5526, 62.2256] },
  { id: 159, name: "ah_12_181", oblastCode: "12", rayonCode: "181", bbox: [64.718, 51.306, 66.3207, 53.1724], centroid: [52.2392, 65.5194] },
  { id: 158, name: "ah_12_182", oblastCode: "12", rayonCode: "182", bbox: [60.8971, 53.0645, 62.434, 54.0757], centroid: [53.5701, 61.6655] },
  { id: 157, name: "ah_12_183", oblastCode: "12", rayonCode: "183", bbox: [62.5992, 52.6594, 64.475, 53.8161], centroid: [53.2378, 63.5371] },
  { id: 156, name: "ah_12_184", oblastCode: "12", rayonCode: "184", bbox: [64.7184, 53.6534, 66.3117, 54.7167], centroid: [54.185, 65.515] },
  { id: 155, name: "ah_12_185", oblastCode: "12", rayonCode: "185", bbox: [63.5874, 53.4628, 64.9476, 54.3536], centroid: [53.9082, 64.2675] },
  { id: 154, name: "ah_12_186", oblastCode: "12", rayonCode: "186", bbox: [63.0119, 50.8315, 65.4636, 51.9921], centroid: [51.4118, 64.2378] },
  { id: 153, name: "ah_12_187", oblastCode: "12", rayonCode: "187", bbox: [60.7141, 52.1459, 62.5168, 53.0349], centroid: [52.5904, 61.6154] },
  { id: 152, name: "ah_12_188", oblastCode: "12", rayonCode: "188", bbox: [62.7846, 51.6971, 65.004, 52.8574], centroid: [52.2773, 63.8943] },
  { id: 151, name: "ah_12_189", oblastCode: "12", rayonCode: "189", bbox: [61.9792, 51.98, 63.5121, 53.0388], centroid: [52.5094, 62.7457] },
  { id: 150, name: "ah_12_190", oblastCode: "12", rayonCode: "190", bbox: [65.0677, 53.0481, 66.4019, 53.9461], centroid: [53.4971, 65.7348] },
  { id: 149, name: "ah_12_191", oblastCode: "12", rayonCode: "191", bbox: [62.0794, 52.961, 63.7056, 54.2218], centroid: [53.5914, 62.8925] },
  { id: 148, name: "ah_12_272", oblastCode: "12", rayonCode: "272", bbox: [65.188, 50.355, 66.3156, 51.0828], centroid: [50.7189, 65.7518] },
  { id: 147, name: "ah_12_276", oblastCode: "12", rayonCode: "276", bbox: [62.5742, 48.6847, 64.3932, 50.8945], centroid: [49.7896, 63.4837] },
  { id: 146, name: "ah_12_282", oblastCode: "12", rayonCode: "282", bbox: [65.7863, 49.6706, 67.7149, 50.7103], centroid: [50.1905, 66.7506] },
  { id: 170, name: "ah_13_196", oblastCode: "13", rayonCode: "196", bbox: [54.4023, 44.8544, 55.7442, 46.2916], centroid: [45.573, 55.0732] },
  { id: 169, name: "ah_13_197", oblastCode: "13", rayonCode: "197", bbox: [51.4186, 43.1717, 53.0883, 43.4371], centroid: [43.3044, 52.2534] },
  { id: 168, name: "ah_13_198", oblastCode: "13", rayonCode: "198", bbox: [51.3969, 44.1768, 53.402, 44.3888], centroid: [44.2828, 52.3995] },
  { id: 167, name: "ah_13_199", oblastCode: "13", rayonCode: "199", bbox: [50.4937, 44.3745, 50.7307, 44.5239], centroid: [44.4492, 50.6122] },
  { id: 97, name: "ah_14_203", oblastCode: "14", rayonCode: "203", bbox: [75.0425, 53.3214, 77.0859, 54.4573], centroid: [53.8893, 76.0642] },
  { id: 96, name: "ah_14_204", oblastCode: "14", rayonCode: "204", bbox: [73.6738, 52.5205, 76.5536, 53.0742], centroid: [52.7974, 75.1137] },
  { id: 95, name: "ah_14_205", oblastCode: "14", rayonCode: "205", bbox: [73.9678, 50.0403, 76.2857, 51.4317], centroid: [50.736, 75.1268] },
  { id: 94, name: "ah_14_207", oblastCode: "14", rayonCode: "207", bbox: [73.4394, 52.9075, 75.6886, 53.8274], centroid: [53.3674, 74.564] },
  { id: 93, name: "ah_14_208", oblastCode: "14", rayonCode: "208", bbox: [75.5939, 52.959, 77.4003, 53.7114], centroid: [53.3352, 76.4971] },
  { id: 92, name: "ah_14_209", oblastCode: "14", rayonCode: "209", bbox: [77.3845, 51.2549, 78.7471, 52.0703], centroid: [51.6626, 78.0658] },
  { id: 91, name: "ah_14_210", oblastCode: "14", rayonCode: "210", bbox: [76.9404, 50.8157, 78.465, 51.7115], centroid: [51.2636, 77.7027] },
  { id: 90, name: "ah_14_211", oblastCode: "14", rayonCode: "211", bbox: [76.6109, 51.9122, 77.9067, 52.9967], centroid: [52.4544, 77.2588] },
  { id: 89, name: "ah_14_212", oblastCode: "14", rayonCode: "212", bbox: [76.8083, 52.7025, 78.3228, 53.5481], centroid: [53.1253, 77.5656] },
  { id: 88, name: "ah_14_213", oblastCode: "14", rayonCode: "213", bbox: [77.6303, 51.9838, 78.7687, 52.8845], centroid: [52.4341, 78.1995] },
  { id: 87, name: "ah_14_215", oblastCode: "14", rayonCode: "215", bbox: [75.6249, 51.6399, 77.0863, 52.6118], centroid: [52.1259, 76.3556] },
  { id: 86, name: "ah_14_219", oblastCode: "14", rayonCode: "219", bbox: [73.7514, 51.2161, 76.4986, 52.2749], centroid: [51.7455, 75.125] },
  { id: 110, name: "ah_15_157", oblastCode: "15", rayonCode: "157", bbox: [67.2597, 52.5291, 68.7847, 53.8483], centroid: [53.1887, 68.0222] },
  { id: 109, name: "ah_15_162", oblastCode: "15", rayonCode: "162", bbox: [72.2063, 53.105, 73.7749, 54.1369], centroid: [53.6209, 72.9906] },
  { id: 108, name: "ah_15_164", oblastCode: "15", rayonCode: "164", bbox: [68.5596, 53.3206, 71.1544, 54.396], centroid: [53.8583, 69.857] },
  { id: 107, name: "ah_15_165", oblastCode: "15", rayonCode: "165", bbox: [66.008, 52.2068, 68.0509, 53.3585], centroid: [52.7826, 67.0294] },
  { id: 106, name: "ah_15_167", oblastCode: "15", rayonCode: "167", bbox: [70.9811, 53.2821, 72.5164, 54.3662], centroid: [53.8242, 71.7488] },
  { id: 105, name: "ah_15_220", oblastCode: "15", rayonCode: "220", bbox: [68.3492, 54.3976, 70.1643, 55.4418], centroid: [54.9197, 69.2568] },
  { id: 104, name: "ah_15_221", oblastCode: "15", rayonCode: "221", bbox: [69.8005, 53.9627, 71.2941, 55.296], centroid: [54.6294, 70.5473] },
  { id: 103, name: "ah_15_223", oblastCode: "15", rayonCode: "223", bbox: [66.0755, 53.9823, 67.9352, 54.8862], centroid: [54.4343, 67.0054] },
  { id: 102, name: "ah_15_224", oblastCode: "15", rayonCode: "224", bbox: [67.625, 53.7271, 69.033, 54.4942], centroid: [54.1107, 68.329] },
  { id: 101, name: "ah_15_225", oblastCode: "15", rayonCode: "225", bbox: [67.4584, 54.4187, 68.9244, 55.2198], centroid: [54.8192, 68.1914] },
  { id: 100, name: "ah_15_228", oblastCode: "15", rayonCode: "228", bbox: [66.8369, 53.3069, 67.9597, 54.3121], centroid: [53.8095, 67.3983] },
  { id: 99, name: "ah_15_229", oblastCode: "15", rayonCode: "229", bbox: [68.9189, 53.9752, 70.1661, 54.9388], centroid: [54.457, 69.5425] },
  { id: 98, name: "ah_15_231", oblastCode: "15", rayonCode: "231", bbox: [65.9655, 53.2309, 67.1719, 54.0994], centroid: [53.6651, 66.5687] },
  { id: 145, name: "ah_19_286", oblastCode: "19", rayonCode: "286", bbox: [68.764, 42.6062, 70.2494, 43.4701], centroid: [43.0382, 69.5067] },
  { id: 144, name: "ah_19_287", oblastCode: "19", rayonCode: "287", bbox: [68.0041, 41.9662, 69.2454, 42.8718], centroid: [42.419, 68.6248] },
  { id: 143, name: "ah_19_288", oblastCode: "19", rayonCode: "288", bbox: [67.9767, 40.5728, 68.6627, 41.0668], centroid: [40.8198, 68.3197] },
  { id: 142, name: "ah_19_289", oblastCode: "19", rayonCode: "289", bbox: [69.0015, 41.5594, 69.8951, 42.2263], centroid: [41.8928, 69.4483] },
  { id: 141, name: "ah_19_293", oblastCode: "19", rayonCode: "293", bbox: [68.7888, 42.1931, 69.5728, 43.0416], centroid: [42.6173, 69.1808] },
  { id: 140, name: "ah_19_294", oblastCode: "19", rayonCode: "294", bbox: [67.7273, 42.3077, 68.9575, 43.1569], centroid: [42.7323, 68.3424] },
  { id: 139, name: "ah_19_295", oblastCode: "19", rayonCode: "295", bbox: [69.198, 42.1687, 70.3244, 42.7372], centroid: [42.453, 69.7612] },
  { id: 138, name: "ah_19_296", oblastCode: "19", rayonCode: "296", bbox: [68.0428, 40.9594, 69.4982, 41.887], centroid: [41.4232, 68.7705] },
  { id: 137, name: "ah_19_297", oblastCode: "19", rayonCode: "297", bbox: [67.5503, 43.3789, 69.6491, 44.4646], centroid: [43.9217, 68.5997] },
  { id: 136, name: "ah_19_298", oblastCode: "19", rayonCode: "298", bbox: [69.3595, 41.9425, 70.4285, 42.4029], centroid: [42.1727, 69.894] },
  { id: 135, name: "ah_19_300", oblastCode: "19", rayonCode: "300", bbox: [69.7613, 42.3224, 70.6474, 42.73], centroid: [42.5262, 70.2043] },
  { id: 134, name: "ah_19_301", oblastCode: "19", rayonCode: "301", bbox: [67.8382, 41.2176, 68.1298, 42.1782], centroid: [41.6979, 67.984] },
  { id: 133, name: "ah_19_304", oblastCode: "19", rayonCode: "304", bbox: [68.2379, 43.4327, 68.4767, 43.5656], centroid: [43.4992, 68.3573] },
  { id: 132, name: "ah_19_307", oblastCode: "19", rayonCode: "307", bbox: [67.8519, 43.0068, 68.8447, 43.6699], centroid: [43.3383, 68.3483] },
  { id: 14, name: "ah_19_309", oblastCode: "19", rayonCode: "309", bbox: [69.3384, 42.1455, 69.7278, 42.4087], centroid: [42.2771, 69.5331] },
  { id: 131, name: "ah_19_325", oblastCode: "19", rayonCode: "325", bbox: [67.9762, 40.6816, 68.4633, 41.0668], centroid: [40.8742, 68.2198] },
  { id: 130, name: "ah_19_326", oblastCode: "19", rayonCode: "326", bbox: [68.1207, 40.9594, 69.0529, 41.4724], centroid: [41.2159, 68.5868] },
  { id: 129, name: "ah_19_331", oblastCode: "19", rayonCode: "331", bbox: [67.823, 43.0068, 68.8289, 43.6699], centroid: [43.3384, 68.3259] },
  { id: 41, name: "ah_23_239", oblastCode: "23", rayonCode: "239", bbox: [78.6282, 47.2218, 81.3705, 48.2928], centroid: [47.7573, 79.9994] },
  { id: 40, name: "ah_23_240", oblastCode: "23", rayonCode: "240", bbox: [78.2309, 50.4727, 80.1011, 51.4357], centroid: [50.9542, 79.166] },
  { id: 39, name: "ah_23_241", oblastCode: "23", rayonCode: "241", bbox: [80.069, 50.2881, 81.6978, 51.2745], centroid: [50.7813, 80.8834] },
  { id: 48, name: "ah_23_243", oblastCode: "23", rayonCode: "243", bbox: [80.4075, 48.52, 82.2674, 50.1805], centroid: [49.3503, 81.3374] },
  { id: 47, name: "ah_23_244", oblastCode: "23", rayonCode: "244", bbox: [81.6165, 48.2262, 83.2526, 49.0467], centroid: [48.6365, 82.4346] },
  { id: 46, name: "ah_23_248", oblastCode: "23", rayonCode: "248", bbox: [80.3435, 45.8048, 82.9683, 47.5168], centroid: [46.6608, 81.6559] },
  { id: 38, name: "ah_23_252", oblastCode: "23", rayonCode: "252", bbox: [79.5439, 50.2275, 81.324, 50.5712], centroid: [50.3994, 80.434] },
  { id: 45, name: "ah_23_333", oblastCode: "23", rayonCode: "333", bbox: [81.6466, 47.2908, 83.1479, 48.4443], centroid: [47.8676, 82.3973] },
  { id: 21, name: "ah_24_254", oblastCode: "24", rayonCode: "254", bbox: [78.3361, 45.0598, 79.8671, 45.8075], centroid: [45.4337, 79.1016] },
  { id: 20, name: "ah_24_255", oblastCode: "24", rayonCode: "255", bbox: [80.0633, 45.4635, 82.2451, 46.3341], centroid: [45.8988, 81.1542] },
  { id: 30, name: "ah_24_259", oblastCode: "24", rayonCode: "259", bbox: [77.795, 44.9699, 78.1413, 45.3668], centroid: [45.1683, 77.9681] },
  { id: 29, name: "ah_24_260", oblastCode: "24", rayonCode: "260", bbox: [77.489, 44.0, 79.2351, 44.6962], centroid: [44.3481, 78.3621] },
  { id: 28, name: "ah_24_261", oblastCode: "24", rayonCode: "261", bbox: [77.4824, 44.4389, 78.5294, 45.0578], centroid: [44.7483, 78.0059] },
  { id: 27, name: "ah_24_262", oblastCode: "24", rayonCode: "262", bbox: [78.9716, 43.9248, 80.3997, 44.477], centroid: [44.2009, 79.6857] },
  { id: 26, name: "ah_24_263", oblastCode: "24", rayonCode: "263", bbox: [79.478, 45.2028, 80.5339, 46.0168], centroid: [45.6098, 80.006] },
  { id: 19, name: "ah_24_264", oblastCode: "24", rayonCode: "264", bbox: [78.1249, 44.6697, 78.876, 45.3887], centroid: [45.0292, 78.5004] },
  { id: 18, name: "ah_24_268", oblastCode: "24", rayonCode: "268", bbox: [78.2153, 44.9325, 78.4909, 45.0948], centroid: [45.0137, 78.3531] },
  { id: 63, name: "ah_25_104", oblastCode: "25", rayonCode: "104", bbox: [70.508, 48.516, 72.103, 49.3895], centroid: [48.9527, 71.3055] },
  { id: 62, name: "ah_25_106", oblastCode: "25", rayonCode: "106", bbox: [66.7233, 48.5532, 67.7695, 49.5865], centroid: [49.0698, 67.2464] },
];

export function layersByOblast(code: string): GiprozemLayer[] {
  return GIPROZEM_LAYERS.filter((l) => l.oblastCode === code);
}

export function findLayer(id: number): GiprozemLayer | undefined {
  return GIPROZEM_LAYERS.find((l) => l.id === id);
}

// Возвращает все слои, чьи extent пересекаются с прямоугольником.
// Сортируется по площади пересечения (сначала те, что наиболее «попадают»).
// maxLayers — защита от перебора при сильном zoom-out (на всю РК сразу 100+ слоёв).
export function intersectingLayers(
  west: number, south: number, east: number, north: number,
  maxLayers = 8
): GiprozemLayer[] {
  const overlap = (l: GiprozemLayer): number => {
    const [w, s, e, n] = l.bbox;
    const dw = Math.min(e, east) - Math.max(w, west);
    const dh = Math.min(n, north) - Math.max(s, south);
    if (dw <= 0 || dh <= 0) return 0;
    return dw * dh;
  };
  const candidates = GIPROZEM_LAYERS
    .map((l) => ({ layer: l, area: overlap(l) }))
    .filter((c) => c.area > 0)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxLayers)
    .map((c) => c.layer);
  return candidates;
}

// Сколько слоёв всего пересекают bbox (без cap'а) — для индикатора «много слоёв, увеличьте масштаб».
export function intersectingLayersCount(west: number, south: number, east: number, north: number): number {
  let n = 0;
  for (const l of GIPROZEM_LAYERS) {
    const [lw, ls, le, ln] = l.bbox;
    if (le < west || lw > east || ln < south || ls > north) continue;
    n++;
  }
  return n;
}

export function oblastBbox(code: string): [number, number, number, number] {
  const ls = layersByOblast(code);
  if (ls.length === 0) return [46, 40, 88, 56];
  let w = 180, s = 90, e = -180, n = -90;
  for (const l of ls) {
    if (l.bbox[0] < w) w = l.bbox[0];
    if (l.bbox[1] < s) s = l.bbox[1];
    if (l.bbox[2] > e) e = l.bbox[2];
    if (l.bbox[3] > n) n = l.bbox[3];
  }
  return [w, s, e, n];
}

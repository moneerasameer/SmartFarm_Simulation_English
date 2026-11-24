/**
 * Guided presentation content.
 *
 * Every item is written for an engineering defence: what happens, how it works,
 * why it matters, the underlying concept, the formula, the live values and the
 * Arabic presenter notes. Values are functions of the presentation context so
 * the panel always shows the numbers of the guided telemetry frame.
 */

const fmt = (value, digits = 1, suffix = '') => (
  Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—'
);

const recordedTag = (ctx) => (ctx.measured ? 'MEASURED' : 'RECORDED');
const modelTag = () => 'MATLAB MODEL OUTPUT';
const simulatedTag = () => 'SIMULATED';

export const PRESENTATION_STAGES = [
  {
    number: 1,
    id: 'sensing',
    title: 'Soil Moisture Sensing',
    shortTitle: 'Soil sensing',
    target: (ctx) => `sensor${ctx.zoneId}`,
    connection: { type: 'path', from: 'sensor', to: 'node' },
    what: 'A capacitive soil probe measures the water content of the root zone and reports it as a percentage of volumetric water content for the current telemetry frame.',
    how: 'The probe capacitance depends on the dielectric permittivity of the surrounding soil. The ESP32 ADC converts the probe voltage into a raw count, which is calibrated against the dry-air and water-saturated references and mapped to 0–100 %.',
    why: 'Irrigation must follow the actual water available to the plants, not a fixed timetable. A calibrated soil measurement is the primary input of the whole control loop.',
    concept: 'Dielectric sensing · sensor calibration · periodic sampling',
    formula: {
      label: 'Two-point calibration',
      code: 'θ [%] = 100 × (raw − raw_dry) / (raw_wet − raw_dry)\nSampling period = 60 s per frame (dataset assumption)',
    },
    values: [
      { label: 'Frame / sample', get: (ctx) => `#${ctx.sample}`, tag: recordedTag },
      { label: 'Soil moisture', get: (ctx) => fmt(ctx.frame.soil, 1, ' %'), tag: recordedTag },
      { label: 'Air temperature', get: (ctx) => fmt(ctx.frame.temperature, 1, ' °C'), tag: recordedTag },
      { label: 'Air humidity', get: (ctx) => fmt(ctx.frame.humidity, 1, ' %RH'), tag: recordedTag },
      { label: 'Field / node', get: (ctx) => `Field ${ctx.zoneId}`, tag: simulatedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED'],
    arabic:
      'الحساس السعوي يقيس رطوبة التربة اعتماداً على تغيّر السعة الكهربائية مع محتوى الماء. ' +
      'نحوّل القراءة الخام إلى نسبة مئوية بعد معايرة نقطتين: التربة الجافة والمشبعة. ' +
      'هذه القيمة هي المدخل الأساسي لمنظومة الري، لأنها تعبّر عن الماء المتاح فعلياً للجذر. ' +
      'القراءة هنا من مجموعة بيانات مسجّلة (Recorded/Simulated) وليست قياساً حياً إلا عند تفعيل MEASURED.',
  },
  {
    number: 2,
    id: 'esp32',
    title: 'ESP32 Data Acquisition and Processing',
    shortTitle: 'ESP32 processing',
    target: (ctx) => `node${ctx.zoneId}`,
    connection: { type: 'path', from: 'node', to: 'tx' },
    what: 'The ESP32 samples the soil probe and the air sensor, converts the raw values into engineering units, validates them and builds the telemetry payload that will be transmitted.',
    how: 'The ADC and the DHT22 driver fill a compact structure (sequence number, soil, temperature, humidity). A CRC protects the payload; the frame is then handed to the LoRa transceiver over SPI.',
    why: 'Local processing reduces radio airtime and bandwidth, rejects impossible values at the source and guarantees that every frame carries a sequence number for loss detection.',
    concept: 'Embedded data acquisition · quantisation · payload framing and CRC',
    formula: {
      label: 'Telemetry frame',
      code: 'payload = [seq:int16 | soil:uint8 | T:int16 | RH:uint8 | CRC:uint16]\npayload length = 16 bytes · CRC enabled · explicit header',
    },
    values: [
      { label: 'Node', get: (ctx) => `ESP32 + SX1276 · node ${ctx.zoneId}`, tag: simulatedTag },
      { label: 'Payload size', get: () => '16 bytes', tag: simulatedTag },
      { label: 'Integrity', get: () => 'CRC on · explicit header', tag: simulatedTag },
      { label: 'Soil value', get: (ctx) => fmt(ctx.frame.soil, 1, ' %'), tag: recordedTag },
      { label: 'Validity', get: (ctx) => (ctx.frame.valid ? 'valid (0…100 %)' : 'invalid — rejected'), tag: simulatedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED'],
    arabic:
      'المتحكم ESP32 يقرأ الحساسات ويحوّل القيم إلى وحدات هندسية، ثم يبني إطار القياس ويضيف رقم تسلسل وCRC. ' +
      'المعالجة المحلية تقلل زمن الإرسال والطاقة، وترفض القيم غير المنطقية قبل بثّها. ' +
      'رقم التسلسل مهم جداً لأن الخادم يستخدمه لكشف الحزم المفقودة. ' +
      'طول الحمولة 16 بايت وهو نفس الافتراض المستخدم في موديل MATLAB.',
  },
  {
    number: 3,
    id: 'transmission',
    title: 'LoRa Packet Transmission',
    shortTitle: 'LoRa transmission',
    target: (ctx) => `node${ctx.zoneId}`,
    connection: { type: 'path', from: 'tx', to: 'gateway' },
    what: 'The SX1276 radio transmits the frame as LoRa chirps in the EU868 band. The packet is now in the air, travelling towards the gateway.',
    how: 'Chirp spread spectrum spreads each symbol over the configured bandwidth. With SF7, BW 125 kHz, CR 4/5, 8 preamble symbols and a 16-byte payload, the calculated time on air is 46.34 ms at 14 dBm.',
    why: 'LoRa provides long range at very low power, which is ideal for battery-powered field nodes. The airtime determines the achievable update rate and the duty-cycle budget.',
    concept: 'Chirp spread spectrum (CSS) · time on air · link budget · duty cycle',
    formula: {
      label: 'Semtech CSS airtime',
      code: 'T_sym = 2^SF / BW = 2^7 / 125 kHz = 1.024 ms\nT_air = (8 + 4.25 + 33) × 1.024 ms = 46.34 ms',
    },
    values: [
      { label: 'Radio', get: () => 'EU868 · 868.1 MHz · SF7 · BW 125 kHz', tag: simulatedTag },
      { label: 'Time on air', get: (ctx) => fmt(ctx.timeOnAirMs, 2, ' ms'), tag: modelTag },
      { label: 'TX power', get: () => '14 dBm', tag: simulatedTag },
      { label: 'Frame flight (animation)', get: (ctx) => fmt(ctx.latencyMs, 0, ' ms'), tag: modelTag },
      { label: 'Duty-cycle budget', get: () => '1 % (EU868 assumption)', tag: simulatedTag },
    ],
    dataTags: ['SIMULATED', 'MATLAB MODEL OUTPUT'],
    arabic:
      'هنا تبدأ الحزمة رحلتها فعلياً عبر الراديو. LoRa يستخدم تشكيل chirp spread spectrum، ' +
      'وزمن الإرسال يُحسب من معادلة Semtech: زمن الرمز مضروباً في عدد الرموز. ' +
      'القيم الحالية SF7 و125 kHz تعطي 46.34 مللي ثانية. ' +
      'الرسم المتحرك يعرض الحزمة أثناء الطيران، لكن الإرسال اللاسلكي الحقيقي يحتاج عتاد SX1276.',
  },
  {
    number: 4,
    id: 'gateway',
    title: 'LoRa Gateway Reception',
    shortTitle: 'Gateway reception',
    target: () => 'gateway',
    connection: { type: 'path', from: 'gateway', to: 'server' },
    what: 'The gateway receives the LoRa frame, verifies its CRC and forwards the payload to the edge server over the backhaul link.',
    how: 'The gateway demodulates the chirps, checks the frame check sequence, timestamps the arrival, adds link metadata (RSSI/SNR) and forwards the frame to the server using an IP connection.',
    why: 'The gateway is the bridge between the long-range, low-power field network and the IP network where data can be stored and processed.',
    concept: 'LPWAN-to-IP gateway · CRC verification · received signal quality',
    formula: {
      label: 'Link budget (model)',
      code: 'RSSI = P_tx + G_tx + G_rx − PL(d)\nSNR = RSSI − N,  N = −174 + 10log10(BW) + NF',
    },
    values: [
      { label: 'Gateway status', get: (ctx) => ctx.signal.label, tag: simulatedTag },
      { label: 'RSSI', get: (ctx) => fmt(ctx.signal.rssiDbm, 1, ' dBm'), tag: modelTag },
      { label: 'SNR', get: (ctx) => fmt(ctx.signal.snrDb, 1, ' dB'), tag: modelTag },
      { label: 'Distance (model)', get: (ctx) => fmt(ctx.lora && ctx.lora.distanceM, 0, ' m'), tag: modelTag },
      { label: 'Delivery decision', get: (ctx) => (ctx.received ? 'CRC accepted, forwarded' : 'frame not received'), tag: recordedTag },
    ],
    dataTags: ['RECORDED', 'MATLAB MODEL OUTPUT'],
    arabic:
      'البوابة تستقبل إشارة LoRa وتتحقق من سلامة الإطار عبر CRC، ثم تضيف RSSI/SNR والطابع الزمني. ' +
      'دورها الجسر بين شبكة LoRa منخفضة الطاقة وشبكة IP. ' +
      'قيم RSSI وSNR هنا مأخوذة من موديل MATLAB لموازنة الوصلة وليست قياساً ميدانياً. ' +
      'نجاح الاستقبال نفسه مأخوذ من عمود Packet received في البيانات المسجّلة.',
  },
  {
    number: 5,
    id: 'loss',
    title: 'Packet Loss Detection',
    shortTitle: 'Loss detection',
    target: (ctx) => (ctx.lostNow ? 'loss' : 'gateway'),
    connection: (ctx) => (ctx.lostNow ? null : { type: 'path', from: 'gateway', to: 'server' }),
    tone: (ctx) => (ctx.lostNow ? 'danger' : 'ok'),
    what: (ctx) => (ctx.lostNow
      ? 'A missing sequence number, a timeout or an invalid payload was detected: no trustworthy frame reached the processing chain, so the packet is counted as lost and the controller must not act on it.'
      : 'The loss detector compares the expected sequence number with the received frame. This frame arrived correctly, so no gap exists and the frame may proceed to the server.'),
    how: 'Every frame carries a sequence number. A missing number, an invalid payload or a timeout creates a loss event; the detector updates the loss counters and the consecutive-loss watchdog.',
    why: 'Acting on stale or missing data is unsafe. Loss detection makes link quality visible and lets the irrigation controller hold its last valid decision instead of inventing one.',
    concept: 'Sequence-number gap detection · PDR/PLR metrics · watchdog for consecutive losses',
    formula: {
      label: 'Packet delivery metrics',
      code: 'PDR [%] = N_received / N_transmitted × 100\nPLR [%] = 100 − PDR\nFail-safe trips after 3 consecutive lost frames',
    },
    values: [
      { label: 'Frame outcome', get: (ctx) => (ctx.lostNow ? 'LOST — no fresh telemetry' : 'received — no loss'), tag: recordedTag },
      { label: 'PDR', get: (ctx) => fmt(ctx.stats.pdr, 1, ' %'), tag: recordedTag },
      { label: 'PLR', get: (ctx) => fmt(ctx.stats.plr, 1, ' %'), tag: recordedTag },
      { label: 'Lost / sent', get: (ctx) => `${ctx.stats.lost} / ${ctx.stats.sent}`, tag: recordedTag },
      { label: 'Consecutive losses', get: (ctx) => String(ctx.stats.consecutiveLosses), tag: recordedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED'],
    arabic:
      'كشف الفقد يعتمد على أرقام التسلسل: إذا غاب رقم أو فشل CRC أو انتهت مهلة الانتظار نعتبر الحزمة مفقودة. ' +
      'نحسب نسبة التسليم PDR ونسبة الفقد PLR، ونتابع عدد الفقد المتتالي. ' +
      'إذا وصلت الحزمة نعلن «لا يوجد فقد» ونكمل إلى الخادم؛ وإذا فُقدت فلا يجوز للمتحكم أن يتصرف على بيانات قديمة. ' +
      'هذه المرحلة هي أساس عرض الحزم الحمراء في المشهد ثلاثي الأبعاد.',
  },
  {
    number: 6,
    id: 'server',
    title: 'Edge Server Processing',
    shortTitle: 'Edge server',
    target: () => 'server',
    connection: { type: 'path', from: 'server', to: 'db' },
    what: 'The edge server validates the frame, normalises the units and prepares the record that will be stored and used by the control logic.',
    how: 'The server checks that the soil value is numeric and inside 0–100 %, verifies the sequence number, timestamps the record and runs the same documented control law as the MATLAB/VHDL implementation.',
    why: 'Central validation rejects corrupt frames, keeps a single source of truth and decouples the low-power field devices from the monitoring application.',
    concept: 'Edge computing · data validation · payload normalisation',
    formula: {
      label: 'Validity rule',
      code: 'valid = frame_received ∧ (0 ≤ soil ≤ 100 %)\ninvalid frame → treated exactly like a lost frame',
    },
    values: [
      { label: 'Frame valid', get: (ctx) => (ctx.frame.valid ? 'yes' : `no — ${ctx.frame.invalidReason || 'invalid'}`), tag: recordedTag },
      { label: 'Soil in range', get: (ctx) => fmt(ctx.frame.soil, 1, ' %'), tag: recordedTag },
      { label: 'Sequence number', get: (ctx) => `#${ctx.sample}`, tag: recordedTag },
      { label: 'Control law', get: () => 'hysteresis 30 % / 40 % + hold', tag: simulatedTag },
      { label: 'Record timestamp', get: (ctx) => ctx.arrivalTime || 'processing…', tag: simulatedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED'],
    arabic:
      'الخادم الطرفي يتحقق من صحة الإطار: القيمة يجب أن تكون رقمية وضمن 0–100%، ورقم التسلسل يجب ألا يكون مكرراً. ' +
      'ثم يطبّق نفس قانون التحكم المستخدم في MATLAB وVHDL حتى تكون النتائج متسقة. ' +
      'هذه الطبقة تمنع البيانات التالفة من الوصول إلى قاعدة البيانات أو إلى المضخة. ' +
      'الإطار غير الصالح يعامل تماماً كإطار مفقود ولا يُتخذ قرار بناءً عليه.',
  },
  {
    number: 7,
    id: 'database',
    title: 'Database Storage',
    shortTitle: 'Database',
    target: () => 'database',
    connection: { type: 'path', from: 'db', to: 'screen' },
    what: 'The verified frame and the corresponding irrigation decision are appended to the time-series database.',
    how: 'Each record is keyed by the sample number and contains the sensor values, the link outcome, the controller state and a timestamp. The append-only schema makes the history auditable and reproducible.',
    why: 'The database preserves history for the charts, for post-run analysis and for auditing the controller decisions. It also allows a lost frame to be distinguished from a received one.',
    concept: 'Time-series schema · append-only storage · traceability',
    formula: {
      label: 'Stored record',
      code: 'record = {sample, timestamp, soil, T, RH, received, pump, decision_code}\nprimary key = sample (idempotent append)',
    },
    values: [
      { label: 'Frames processed', get: (ctx) => String(ctx.stats.sent), tag: recordedTag },
      { label: 'Stored in session', get: (ctx) => `${ctx.stats.sent} record(s)`, tag: simulatedTag },
      { label: 'Frame key', get: (ctx) => `#${ctx.sample}`, tag: recordedTag },
      { label: 'Pump decision', get: (ctx) => (ctx.decision.pump ? 'ON' : 'OFF'), tag: simulatedTag },
      { label: 'Storage type', get: () => 'in-memory time-series store', tag: simulatedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED'],
    arabic:
      'قاعدة البيانات تحفظ الإطار بعد التحقق منه مع قرار الري، بمفتاح هو رقم العيّنة. ' +
      'التخزين من نوع time-series وبنمط append-only، وهذا يجعل السجل قابلاً للتدقيق وإعادة التشغيل. ' +
      'من هنا تأتي الرسوم البيانية التاريخية وإمكانية مقارنة قرار المتحكم مع القرار المسجّل. ' +
      'في هذه النسخة التخزين داخل جلسة المتصفح (Session store) وليس خادم SQL حقيقي.',
  },
  {
    number: 8,
    id: 'decision',
    title: 'Smart Irrigation Decision',
    shortTitle: 'Control decision',
    target: () => 'station',
    connection: { type: 'link', from: 'station', to: 'pump' },
    tone: (ctx) => (ctx.decision.changed ? 'ok' : 'warm'),
    what: (ctx) => (ctx.lostNow
      ? 'No fresh telemetry is available, so the controller holds its previous command. It never invents a decision from stale data.'
      : `The controller applies the hysteresis law: ${ctx.decision.action}.`),
    how: 'Below 30 % the pump is switched ON; above 40 % it is switched OFF; inside the 30–40 % band the previous state is kept. If three consecutive frames are lost, the fail-safe watchdog forces the pump OFF.',
    why: 'Hysteresis prevents valve chatter around a single threshold. Holding on invalid or lost data is the safe engineering choice, and the watchdog protects against a long outage.',
    concept: 'Hysteresis control · state machine · fail-safe / watchdog',
    formula: {
      label: 'Documented control law',
      code: 'soil < 30 % → ON\nsoil > 40 % → OFF\n30 ≤ soil ≤ 40 % → hold previous state\ninvalid or lost frame → hold\n3 consecutive losses → fail-safe OFF',
    },
    values: [
      { label: 'Soil moisture', get: (ctx) => fmt(ctx.frame.soil, 1, ' %'), tag: recordedTag },
      { label: 'Thresholds', get: (ctx) => `ON < ${ctx.thresholds.dry} % · OFF > ${ctx.thresholds.wet} %`, tag: simulatedTag },
      { label: 'Previous state', get: (ctx) => (ctx.decision.previous ? 'ON' : 'OFF'), tag: simulatedTag },
      { label: 'New state', get: (ctx) => (ctx.decision.pump ? 'ON' : 'OFF'), tag: simulatedTag },
      { label: 'Reason code', get: (ctx) => ctx.decision.code, tag: simulatedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED'],
    arabic:
      'المتحكم يطبّق قانون الهيستيريسيس: أقل من 30% تشغيل، أعلى من 40% إيقاف، وبينهما الاحتفاظ بالحالة السابقة. ' +
      'الفائدة من النطاق الميت منع التشغيل والإيقاف المتكرر حول عتبة واحدة. ' +
      'عند فقد البيانات أو وصول قيمة غير صالحة لا يتخذ قراراً جديداً بل يحتفظ بالقرار الأخير. ' +
      'وبعد ثلاث حالات فقد متتالية يفعّل الـ fail-safe ويوقف المضخة كحالة آمنة.',
  },
  {
    number: 9,
    id: 'pump',
    title: 'Pump Activation or Deactivation',
    shortTitle: 'Actuator',
    target: () => 'pump',
    connection: { type: 'link', from: 'station', to: 'pump' },
    tone: (ctx) => (ctx.decision.pump ? 'ok' : (ctx.decision.changed ? 'warm' : 'cyan')),
    what: (ctx) => {
      if (ctx.lostNow) return 'The frame is lost, so the pump command is held. No valve or relay action is taken on stale telemetry.';
      if (ctx.decision.changed) return `The controller command changes to pump ${ctx.decision.pump ? 'ON' : 'OFF'}; the relay follows the decision and the irrigation animation starts or stops.`;
      return 'The controller keeps the previous pump state because the soil value is inside the hysteresis band (or the command did not change).';
    },
    how: 'A relay module drives the low-voltage pump. The command is derived only from a valid received frame and the documented state machine; the 3D view animates the impeller and the water flow.',
    why: 'This is the physical action of the automation chain. The safe state is OFF, and the pump must never be switched using a missing or impossible measurement.',
    concept: 'Actuation · relay interlock · safe-state design',
    formula: {
      label: 'Actuator command',
      code: 'pump_cmd(t) = f(soil(t), pump_cmd(t−1), frame_valid)\npump_cmd ∈ {OFF, ON} · safe state = OFF',
    },
    values: [
      { label: 'Pump command', get: (ctx) => (ctx.decision.pump ? 'ON' : 'OFF'), tag: simulatedTag },
      { label: 'Command changed', get: (ctx) => (ctx.decision.changed ? 'yes' : 'no (hold)'), tag: simulatedTag },
      { label: 'Decision reason', get: (ctx) => ctx.decision.code, tag: simulatedTag },
      { label: 'Controller mode', get: (ctx) => ctx.mode, tag: simulatedTag },
      { label: 'Tank level', get: () => '70 % (visual only)', tag: simulatedTag },
    ],
    dataTags: ['SIMULATED'],
    arabic:
      'هذه هي مرحلة التنفيذ الفعلي: أمر التشغيل يصل إلى الريليه ثم إلى المضخة، وتبدأ المياه بالتحرك في الأنابيب. ' +
      'القرار لا يُتخذ إلا من إطار صالح، والحالة الآمنة هي OFF. ' +
      'عند بقاء الرطوبة بين 30 و40% لا تتغير حالة المضخة، وهذا يمنع الاهتزاز. ' +
      'في حال الفقد نحافظ على القرار الأخير، ولا نشغّل المضخة بناءً على قياس غير موجود.',
  },
  {
    number: 10,
    id: 'dashboard',
    title: 'Dashboard Monitoring',
    shortTitle: 'Dashboard',
    target: () => 'station',
    connection: (ctx) => (ctx.lostNow ? null : { type: 'path', from: 'db', to: 'screen' }),
    tone: (ctx) => (ctx.lostNow ? 'danger' : 'ok'),
    what: (ctx) => (ctx.lostNow
      ? 'The dashboard records the loss, raises a link alert and keeps the last valid measurement visible. It does not present stale data as a fresh measurement.'
      : 'The dashboard updates the sensor values, charts, packet table and 3D labels with the frame that reached the database.'),
    how: 'The browser stores the processed frame in the session history, refreshes the Chart.js panels, updates the 3D labels and evaluates the alert rules (thresholds, loss ratio, invalid frames).',
    why: 'The operator needs situation awareness and traceability: what was measured, what the controller decided, and whether the link is healthy.',
    concept: 'HMI · observability · data provenance and alerting',
    formula: {
      label: 'Monitoring metrics',
      code: 'PDR_target ≥ 90 %\nlatency = T_air + forwarding + jitter (model)\nprovenance = SIMULATED | RECORDED | MODEL | MEASURED',
    },
    values: [
      { label: 'PDR', get: (ctx) => fmt(ctx.stats.pdr, 1, ' %'), tag: recordedTag },
      { label: 'Packets lost', get: (ctx) => String(ctx.stats.lost), tag: recordedTag },
      { label: 'Link state', get: (ctx) => ctx.signal.label, tag: recordedTag },
      { label: 'Frame shown', get: (ctx) => `#${ctx.sample}`, tag: recordedTag },
      { label: 'Data provenance', get: (ctx) => (ctx.measured ? 'MEASURED (live device)' : 'RECORDED / SIMULATED replay'), tag: recordedTag },
    ],
    dataTags: ['RECORDED', 'SIMULATED', 'MATLAB MODEL OUTPUT'],
    arabic:
      'لوحة المراقبة هي واجهة المشغّل: تعرض القيم، الرسوم، حالة الوصلة، وسجل الحزم. ' +
      'كل قيمة تحمل وسم مصدرها بوضوح: Recorded أو Simulated أو MATLAB Model Output أو Measured. ' +
      'عند الفقد ترفع تنبيهاً وتُبقي آخر قيمة صالحة مع توضيح أنها قديمة، ولا تعرضها كقياس جديد. ' +
      'هذه الشفافية مهمة جداً في مشروع التخرج حتى لا يُفهم أن البيانات المحاكاة قياسات حقيقية.',
  },
];

/**
 * Interactive component explanations (click a component in the 3D view).
 */
export const COMPONENT_INFO = {
  sensor: {
    key: 'sensor',
    title: 'Capacitive Soil Moisture Sensor',
    role: 'Primary sensing element of the irrigation loop. It converts soil water content into an analog voltage that the ESP32 can sample.',
    how: 'The probe forms a capacitor whose dielectric is the surrounding soil. Water raises the dielectric permittivity, which changes the capacitance and therefore the output voltage. A two-point calibration maps the raw ADC value to 0–100 %.',
    why: 'Without a calibrated soil measurement the controller cannot know when irrigation is required. This is the physical variable the whole automation chain is built on.',
    specs: [
      'Output: analog 0–3.3 V (resistive divider / capacitive front-end)',
      'Measuring range used here: 0–100 % volumetric water content',
      'Calibration: dry-air and water-saturated reference points',
      'Installation: probe inserted 5–10 cm into the root zone',
      'Limitations: soil salinity, temperature drift and sensor ageing',
    ],
    dataTag: 'RECORDED (simulated dataset) / MEASURED when live',
    arabic:
      'هذا الحساس هو نقطة البداية في السلسلة. يعمل كمكثّف يكون فيه التراب هو العازل، وزيادة الماء ترفع ثابت العزل وبالتالي تتغير السعة والجهد. ' +
      'نحوّل القراءة الخام إلى نسبة مئوية بمعايرة نقطتين. يجب تثبيته بعمق 5–10 سم في منطقة الجذور. ' +
      'من قيوده: الملوحة ودرجة الحرارة وتقادم الحساس، ولهذا نحتاج معايرة دورية.',
  },
  air: {
    key: 'air',
    title: 'Air Temperature & Humidity Node',
    role: 'Provides the environmental context (air temperature and relative humidity) that is transmitted together with the soil frame.',
    how: 'A DHT22-class sensor measures temperature with a thermistor and humidity with a capacitive polymer layer. The ESP32 reads it over a single-wire protocol and includes both values in the telemetry payload.',
    why: 'Soil moisture alone does not describe the crop environment: high temperature and low humidity increase evapotranspiration, so the same soil value may require different irrigation timing.',
    specs: [
      'Temperature accuracy: about ±0.5 °C',
      'Relative humidity accuracy: about ±2–5 %RH',
      'Sampling rate: 0.5 Hz maximum (2 s between reads)',
      'Interface: single-wire digital bus',
      'Shield: radiation shield / filter to protect the sensing element',
    ],
    dataTag: 'RECORDED (simulated dataset) / MEASURED when live',
    arabic:
      'عقدة الهواء تقيس الحرارة والرطوبة النسبية بجانب الحقل. الحساس من نوع DHT22 يعطي دقة تقارب ±0.5 درجة و±2–5% للرطوبة. ' +
      'هذه القيم مهمة لأن الحرارة العالية والرطوبة المنخفضة تزيد التبخر، وقد تتطلب ريًا أسرع حتى لو كانت رطوبة التربة متشابهة. ' +
      'نستخدم درعًا إشعاعيًا لحماية الحساس من الشمس المباشرة.',
  },
  node: {
    key: 'node',
    title: 'ESP32 + LoRa End Node',
    role: 'Field controller that samples the sensors, validates the values, builds the telemetry frame and transmits it over LoRa.',
    how: 'The ESP32 reads the ADC and the digital sensor, packs a 16-byte payload (sequence number, soil, temperature, humidity, CRC) and sends it to the SX1276 transceiver over SPI. The node can sleep between measurements to save energy.',
    why: 'Local acquisition and validation keep the radio traffic minimal and guarantee that only meaningful, sequenced frames reach the gateway.',
    specs: [
      'MCU: ESP32 dual-core, 240 MHz, 12-bit ADC',
      'Radio: SX1276 / RFM95, EU868, SF7, BW 125 kHz',
      'Payload: 16 bytes with CRC and explicit header',
      'Bus: SPI to the radio, ADC / one-wire to the sensors',
      'Energy: deep sleep between 60 s measurement cycles',
    ],
    dataTag: 'SIMULATED model of the embedded node',
    arabic:
      'عقدة ESP32 هي عقل الحقل: تقرأ الحساسات، تتحقق من القيم، تبني إطارًا من 16 بايتًا وتضيف رقم تسلسل وCRC، ثم ترسله إلى راديو SX1276 عبر SPI. ' +
      'المعالجة المحلية تقلل كمية البيانات المرسلة وتضمن أن الأطر غير الصالحة لا تصل إلى البوابة. ' +
      'يمكن للمتحكم الدخول في نوم عميق بين القياسات لتوفير الطاقة. ' +
      'هذه العقدة في المحاكاة نموذج برمجي وليست لوحة عتاد فعلية.',
  },
  gateway: {
    key: 'gateway',
    title: 'LoRa Gateway',
    role: 'Receives LoRa frames from all field nodes and forwards them to the edge server over an IP backhaul.',
    how: 'The gateway demodulates the chirp-spread-spectrum signal, validates the CRC, records RSSI/SNR and timestamps, then forwards the payload to the server through MQTT, HTTP or a serial link.',
    why: 'It connects the low-power, long-range field network to the IP infrastructure where storage and control logic live. Without it, node data would never reach the dashboard.',
    specs: [
      'Band: EU868, 868.1 MHz, SF7–SF12',
      'Channels: 8 uplink channels (LoRaWAN-like assumption)',
      'Link metrics: RSSI and SNR added to each frame',
      'Backhaul: Ethernet / Wi-Fi / USB serial to the server',
      'Placement: elevated mast for line-of-sight coverage',
    ],
    dataTag: 'SIMULATED gateway model · RSSI/SNR = MATLAB MODEL OUTPUT',
    arabic:
      'البوابة هي الجسر بين شبكة LoRa وشبكة IP. تستقبل الإطارات وتتحقق من CRC وتضيف RSSI وSNR والطابع الزمني. ' +
      'ثم ترسل البيانات إلى الخادم عبر MQTT أو HTTP أو USB. ' +
      'موقع البوابة على عمود مرتفع مهم لتحسين خط النظر وتغطية الحقول. ' +
      'قيم RSSI وSNR المعروضة من موديل MATLAB وليست قياسات ميدانية.',
  },
  server: {
    key: 'server',
    title: 'Edge Server / Control Service',
    role: 'Validates incoming frames, applies the irrigation control law and writes the processed record to the database.',
    how: 'The server receives the gateway payload, checks ranges and sequence numbers, recomputes the control state and exposes the result to the dashboard through an API or an internal event bus.',
    why: 'Central processing keeps the field nodes simple, guarantees that every recorded decision follows the same validated law and allows the dashboard to stay stateless.',
    specs: [
      'Input: MQTT / HTTP / Web Serial frames',
      'Validation: numeric values, 0–100 % soil range, sequence continuity',
      'Control law: hysteresis 30 % / 40 % with hold and fail-safe',
      'Output: normalised record + controller decision',
      'Deployment: local edge service (session store in this demo)',
    ],
    dataTag: 'SIMULATED service · inputs RECORDED',
    arabic:
      'الخادم الطرفي هو مركز المعالجة: يستقبل الإطار من البوابة، يتحقق من القيم ورقم التسلسل، ويطبّق قانون التحكم. ' +
      'بعدها يجهّز سجلاً موحّداً يرسله لقاعدة البيانات ولوحة المراقبة. ' +
      'هذا الفصل يجعل عقد الحقل بسيطة ويضمن أن كل القرارات تتبع نفس القانون. ' +
      'في هذه النسخة الخادم محاكى داخل المتصفح وليس خدمة سحابية حقيقية.',
  },
  database: {
    key: 'database',
    title: 'Time-Series Database',
    role: 'Stores every validated frame and controller decision so the history, charts and audits can be reconstructed.',
    how: 'Records are appended with the sample number as the primary key. Each row contains the timestamp, soil, temperature, humidity, delivery flag, pump state and decision code.',
    why: 'Historical data is needed to prove the controller behaviour, compute delivery ratios and compare the live controller with the recorded pump column.',
    specs: [
      'Model: append-only time-series records',
      'Key: sample number (idempotent writes)',
      'Fields: timestamp, soil, T, RH, received, pump, decision code',
      'Queries: rolling window for charts, full history for audit',
      'Retention: session store in this demo; SQL/InfluxDB in a real deployment',
    ],
    dataTag: 'SIMULATED storage · content RECORDED',
    arabic:
      'قاعدة البيانات تحفظ كل إطار صالح مع قرار المتحكم. المفتاح هو رقم العيّنة، وهذا يمنع التكرار ويجعل الكتابة قابلة لإعادة التنفيذ. ' +
      'نحتاج التاريخ لحساب نسب التسليم، ورسم المنحنيات، ومقارنة قرار المتحكم مع عمود Pump المسجّل. ' +
      'في النسخة الحالية التخزين داخل جلسة المتصفح؛ في نشر حقيقي نستخدم SQL أو InfluxDB. ' +
      'كل ما يُخزّن هنا مصدره بيانات مسجّلة أو محاكاة، وليس قياساً حياً.',
  },
  pump: {
    key: 'pump',
    title: 'Irrigation Pump & Relay',
    role: 'Actuator of the irrigation loop. It converts the controller command into water flow through the pipe network.',
    how: 'A relay module switches the low-voltage pump. The command is accepted only from a valid received frame and the documented state machine; the 3D impeller and pipe texture animate the resulting flow.',
    why: 'The pump is the physical outcome of the automation. Its safe state is OFF, and it must never run on stale, missing or impossible sensor data.',
    specs: [
      'Actuation: relay-driven low-voltage pump',
      'Safe state: OFF (also after reset or 3 consecutive losses in fail-safe mode)',
      'Interlock: command only from a valid, received frame',
      'Status feedback: simulated relay/LED and water-flow animation',
      'Protection: dry-run protection would be required in real hardware',
    ],
    dataTag: 'SIMULATED actuator command',
    arabic:
      'المضخة هي المخرج الفيزيائي للنظام. الريليه يحوّل أمر المتحكم إلى تشغيل أو إيقاف. ' +
      'لا نقبل الأمر إلا من إطار صالح ومستقبل، والحالة الآمنة هي OFF. ' +
      'في وضع fail-safe تتوقف المضخة بعد ثلاث حالات فقد متتالية. ' +
      'الحركة في الأنابيب والمروحة في المشهد ثلاثي الأبعاد تمثيل بصري، وليست قياس تدفق حقيقي. ' +
      'في العتاد الحقيقي يجب إضافة حماية من التشغيل الجاف.',
  },
  tank: {
    key: 'tank',
    title: 'Water Tank',
    role: 'Stores the water buffer that feeds the pump and the drip manifold.',
    how: 'Water is drawn from the tank by the pump and distributed through the main pipe and field risers. In this digital twin the tank level is a fixed visual value; no level sensor is modelled.',
    why: 'A tank decouples the water supply from the irrigation schedule. In a real farm, a low level would stop the pump to avoid dry running.',
    specs: [
      'Capacity: visual model (no physical volume computed)',
      'Level indication: 70 % decorative value, not a measurement',
      'Outlet: bottom pipe to the pump inlet',
      'Real sensor option: float switch or ultrasonic level sensor',
      'Protection: dry-run interlock when the level is too low',
    ],
    dataTag: 'SIMULATED visualisation — no level sensor',
    arabic:
      'الخزان يوفّر مخزون الماء الذي تغذيه المضخة ثم شبكة الأنابيب. ' +
      'في هذا التوأم الرقمي مستوى الماء قيمة بصرية ثابتة (70%) وليس قياساً من حساس مستوى. ' +
      'في مزرعة حقيقية نضيف عوّامة أو حساس مسافة فوق السطح، ونمنع المضخة من العمل إذا انخفض المستوى. ' +
      'هذا يمنع التشغيل الجاف ويحمي المضخة.',
  },
  station: {
    key: 'station',
    title: 'Central Monitoring Station',
    role: 'Control room and HMI: displays the processed telemetry, the irrigation state, the packet log, the alerts and the 3D digital twin.',
    how: 'The station screen renders the values of the current frame and the link state. The browser dashboard adds Chart.js history, the 3D labels, the packet stage chain and the diagnostics.',
    why: 'The operator must be able to verify what the system measured, what it decided and whether the communication link is healthy. The station is also the audit point for the data provenance labels.',
    specs: [
      'HMI: live values, charts, packet table, alerts, diagnostics',
      '3D twin: labels, packet animation, component highlights',
      'Provenance: SIMULATED / RECORDED / MATLAB MODEL OUTPUT / MEASURED',
      'Presentation: guided tour with Arabic presenter notes',
      'Control: threshold changes, hold / fail-safe mode selection',
    ],
    dataTag: 'SIMULATED HMI · displays RECORDED and MODEL values',
    arabic:
      'محطة المراقبة هي غرفة التحكم: شاشة تعرض القيم الحالية وحالة المضخة وسجل الحزم والتنبيهات، إضافة إلى التوأم الرقمي ثلاثي الأبعاد. ' +
      'في المتصفح نضيف الرسوم البيانية والتشخيص الذاتي ووضع العرض التقديمي. ' +
      'دورها الأساسي أن يرى المشغّل ماذا قِيس، وماذا قرر النظام، وهل الوصلة سليمة. ' +
      'كل قيمة على الشاشة تحمل وسم مصدرها، ولا نعرض المحاكاة كقياس حقيقي.',
  },
};

export const PRESENTATION_TOTAL = PRESENTATION_STAGES.length;

export function stageByNumber(number) {
  return PRESENTATION_STAGES.find((stage) => stage.number === number) || null;
}

export function componentKeyForId(id) {
  if (!id) return null;
  const zoneMatch = /^(sensor|node)([A-D])$/.exec(id);
  if (zoneMatch) return zoneMatch[1];
  return COMPONENT_INFO[id] ? id : null;
}

export function componentForId(id) {
  const key = componentKeyForId(id);
  if (!key) return null;
  const base = COMPONENT_INFO[key];
  const zone = /[A-D]$/.test(id) ? id.slice(-1) : null;
  return {
    ...base,
    name: zone ? `${base.title} — Field ${zone}` : base.title,
    clickedId: id,
    zone,
  };
}

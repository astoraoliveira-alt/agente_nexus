const metrics = [
  { metricType: 'stt_minutes', value: 5.6666, cost: 0.2834 },
  { metricType: 'tts_minutes', value: 5.6666, cost: 0.2834 },
  { metricType: 'tokens', value: 370315, cost: 2.7230 },
  { metricType: 'messages', value: 771, cost: 0 },
];
// If I use prices... The user has plan_details.limits, but DOES NOT HAVE plan_prices in the JSON!
const prices = undefined;
const calc = (m) => {
    if (!prices || Object.keys(prices).length === 0) return m.cost;
    return m.cost;
};
let total = 0;
metrics.forEach(m => {
    const c = calc(m);
    total += c;
    console.log(m.metricType, c);
});
console.log('total', total);

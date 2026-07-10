(function () {
  const DATA_URL = 'assets/openmeteo-dashboard-data.json';

  function fmt(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return '--';
    return Number(value).toFixed(decimals);
  }

  function avg(rows, field) {
    const vals = rows.map(r => Number(r[field])).filter(v => Number.isFinite(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function sum(rows, field) {
    return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
  }

  function maxByTimestamp(rows) {
    return [...rows].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  }

  function groupBy(rows, key) {
    return rows.reduce((acc, r) => {
      const k = r[key] || 'Unknown';
      if (!acc[k]) acc[k] = [];
      acc[k].push(r);
      return acc;
    }, {});
  }

  function plotConfig() {
    return {
      responsive: true,
      displayModeBar: false
    };
  }

  function layoutBase(title) {
    return {
      title: { text: title, font: { size: 14 } },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#dbeafe', family: 'Inter, system-ui, sans-serif' },
      margin: { l: 48, r: 18, t: 42, b: 45 },
      xaxis: { gridcolor: 'rgba(255,255,255,.10)', zerolinecolor: 'rgba(255,255,255,.12)' },
      yaxis: { gridcolor: 'rgba(255,255,255,.10)', zerolinecolor: 'rgba(255,255,255,.12)' },
      legend: { orientation: 'h', y: -0.25 }
    };
  }

  function setText(container, selector, value) {
    const el = container.querySelector(selector);
    if (el) el.textContent = value;
  }

  function initDashboard(container, payload) {
    const records = payload.records || [];
    const lang = container.getAttribute('data-dashboard-lang') || 'es';
    const labels = {
      es: {
        all: 'Todas las ciudades',
        temp: 'Temperatura Actual',
        rain: 'Lluvia Actual',
        prob: 'Prob. Lluvia',
        humidity: 'Humedad',
        wind: 'Viento',
        capture: 'Última Captura',
        rainCity: 'Lluvia última medición por ciudad',
        rainLine: 'Nivel de lluvia por hora: Forecast vs Real',
        probLine: 'Probabilidad de lluvia por hora',
        map: 'Pronóstico de lluvia por ubicación',
        cityAxis: 'Ciudad',
        rainAxis: 'Lluvia mm',
        probabilityAxis: 'Probabilidad %',
        hourAxis: 'Hora',
        mapProbability: 'Probabilidad de lluvia'
      },
      en: {
        all: 'All cities',
        temp: 'Current Temperature',
        rain: 'Current Rain',
        prob: 'Rain Prob.',
        humidity: 'Humidity',
        wind: 'Wind',
        capture: 'Last Capture',
        rainCity: 'Last measurement rain by city',
        rainLine: 'Hourly rain level: Forecast vs Actual',
        probLine: 'Hourly rain probability',
        map: 'Rain forecast by location',
        cityAxis: 'City',
        rainAxis: 'Rain mm',
        probabilityAxis: 'Probability %',
        hourAxis: 'Hour',
        mapProbability: 'Rain probability'
      }
    }[lang];

    const select = container.querySelector('[data-weather-filter="city"]');
    const cities = [...new Set(records.map(r => r.city))].sort();
    select.innerHTML = `<option value="">${labels.all}</option>` + cities.map(c => `<option value="${c}">${c}</option>`).join('');

    function currentRows() {
      return records.filter(r => r.last_measure === true || r.last_measure === 'True');
    }

    function applyFilter(rows) {
      const city = select.value;
      return city ? rows.filter(r => r.city === city) : rows;
    }

    function render() {
      const filteredAll = applyFilter(records);
      const latestRows = applyFilter(currentRows());
      const latest = maxByTimestamp(latestRows) || maxByTimestamp(filteredAll);

      setText(container, '[data-kpi="temp"]', fmt(avg(latestRows, 'temperature_2m'), 1) + ' °C');
      setText(container, '[data-kpi="rain"]', fmt(avg(latestRows, 'precipitation'), 2) + ' mm');
      setText(container, '[data-kpi="prob"]', fmt(avg(latestRows, 'precipitation_probability'), 1) + '%');
      setText(container, '[data-kpi="humidity"]', fmt(avg(latestRows, 'relative_humidity_2m'), 1) + '%');
      setText(container, '[data-kpi="wind"]', fmt(avg(latestRows, 'wind_speed_10m'), 1) + ' nudos');
      setText(container, '[data-kpi="capture"]', latest ? new Date(latest.timestamp).toLocaleString(lang === 'es' ? 'es-PA' : 'en-US') : '--');

      const byCity = groupBy(latestRows.length ? latestRows : currentRows(), 'city');
      const cityAgg = Object.entries(byCity).map(([city, rows]) => ({
        city,
        rain: avg(rows, 'precipitation') || 0
      })).sort((a, b) => a.rain - b.rain);

      Plotly.react(container.querySelector('[data-chart="rain-bar"]'), [{
        type: 'bar',
        orientation: 'h',
        x: cityAgg.map(d => d.rain),
        y: cityAgg.map(d => d.city),
        hovertemplate: '%{y}<br>Lluvia: %{x:.2f} mm<extra></extra>'
      }], {
        ...layoutBase(labels.rainCity),
        xaxis: { ...layoutBase().xaxis, title: labels.rainAxis },
        yaxis: { ...layoutBase().yaxis, title: labels.cityAxis, automargin: true }
      }, plotConfig());

      const rainRows = filteredAll.filter(r => Math.abs(Number(r.event_distance_hour)) <= 8);
      const byLabel = groupBy(rainRows, 'label');
      const rainTraces = Object.entries(byLabel).map(([label, rows]) => {
        rows = [...rows].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const byTime = groupBy(rows, 'timestamp');
        const points = Object.entries(byTime).map(([ts, rs]) => ({
          ts,
          value: avg(rs, 'precipitation') || 0
        })).sort((a, b) => new Date(a.ts) - new Date(b.ts));
        return {
          type: 'scatter',
          mode: 'lines+markers',
          name: label,
          x: points.map(p => p.ts),
          y: points.map(p => p.value),
          hovertemplate: '%{x}<br>%{y:.2f} mm<extra></extra>'
        };
      });

      Plotly.react(container.querySelector('[data-chart="rain-line"]'), rainTraces, {
        ...layoutBase(labels.rainLine),
        xaxis: { ...layoutBase().xaxis, title: labels.hourAxis },
        yaxis: { ...layoutBase().yaxis, title: labels.rainAxis }
      }, plotConfig());

      const forecastRows = filteredAll.filter(r => r.label === 'Forecast');
      const byTime = groupBy(forecastRows, 'timestamp');
      const probPoints = Object.entries(byTime).map(([ts, rows]) => ({
        ts,
        prob: avg(rows, 'precipitation_probability') || 0
      })).sort((a, b) => new Date(a.ts) - new Date(b.ts));

      Plotly.react(container.querySelector('[data-chart="prob-line"]'), [{
        type: 'scatter',
        mode: 'lines+markers',
        x: probPoints.map(p => p.ts),
        y: probPoints.map(p => p.prob),
        hovertemplate: '%{x}<br>%{y:.1f}%<extra></extra>'
      }], {
        ...layoutBase(labels.probLine),
        xaxis: { ...layoutBase().xaxis, title: labels.hourAxis },
        yaxis: { ...layoutBase().yaxis, title: labels.probabilityAxis, range: [0, 100] }
      }, plotConfig());

      const mapRows = applyFilter(records.filter(r => Number(r.event_distance_hour) === 1));
      const byMapCity = groupBy(mapRows, 'city');
      const mapPoints = Object.entries(byMapCity).map(([city, rows]) => {
        const first = rows[0];
        return {
          city,
          place: first.place_name,
          lat: first.latitude,
          lon: first.longitude,
          prob: avg(rows, 'precipitation_probability') || 0,
          rain: avg(rows, 'precipitation') || 0
        };
      });

      Plotly.react(container.querySelector('[data-chart="forecast-map"]'), [{
        type: 'scattergeo',
        mode: 'markers',
        lat: mapPoints.map(d => d.lat),
        lon: mapPoints.map(d => d.lon),
        text: mapPoints.map(d => `${d.city} · ${d.place}<br>${labels.mapProbability}: ${d.prob.toFixed(1)}%<br>Lluvia: ${d.rain.toFixed(2)} mm`),
        hovertemplate: '%{text}<extra></extra>',
        marker: {
          size: mapPoints.map(d => Math.max(9, d.rain * 7 + 10)),
          color: mapPoints.map(d => d.prob),
          colorscale: 'Blues',
          cmin: 0,
          cmax: 100,
          colorbar: { title: '%' },
          line: { width: 1, color: 'rgba(255,255,255,.45)' }
        }
      }], {
        ...layoutBase(labels.map),
        geo: {
          scope: 'north america',
          projection: { type: 'mercator' },
          lonaxis: { range: [-83.2, -77.0] },
          lataxis: { range: [7.0, 10.1] },
          bgcolor: 'rgba(0,0,0,0)',
          showland: true,
          landcolor: 'rgba(255,255,255,.08)',
          showocean: true,
          oceancolor: 'rgba(14,122,185,.12)',
          showcountries: true,
          countrycolor: 'rgba(255,255,255,.25)',
          showcoastlines: true,
          coastlinecolor: 'rgba(255,255,255,.20)'
        },
        margin: { l: 4, r: 4, t: 42, b: 4 }
      }, plotConfig());
    }

    select.addEventListener('change', render);
    const reset = container.querySelector('[data-weather-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        select.value = '';
        render();
      });
    }

    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    const containers = document.querySelectorAll('[data-openmeteo-static-dashboard]');
    if (!containers.length) return;

    function loadDashboard() {
      fetch(DATA_URL)
        .then(res => res.json())
        .then(payload => {
          containers.forEach(container => initDashboard(container, payload));
        })
        .catch(err => {
          containers.forEach(container => {
            container.innerHTML = '<p class="dashboard-error">No se pudo cargar el archivo estático de datos del dashboard.</p>';
          });
          console.error(err);
        });
    }

    function loadDashboardSafe() {
      const inlineData = document.getElementById('openmeteo-dashboard-data');
      if (inlineData && inlineData.textContent.trim()) {
        try {
          const payload = JSON.parse(inlineData.textContent);
          containers.forEach(container => initDashboard(container, payload));
          return;
        } catch (err) {
          console.warn('Inline weather dashboard data could not be parsed. Falling back to fetch.', err);
        }
      }
      loadDashboard();
    }

    if (window.Plotly) {
      loadDashboardSafe();
    } else {
      const timer = setInterval(() => {
        if (window.Plotly) {
          clearInterval(timer);
          loadDashboardSafe();
        }
      }, 100);
      setTimeout(() => clearInterval(timer), 8000);
    }
  });
})();
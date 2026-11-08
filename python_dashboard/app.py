"""Smart Farm Monitoring & Automated Irrigation - Streamlit dashboard.

The dashboard is driven exclusively by the recorded sensor dataset shipped with
the project (``data/sensor_data.csv``).  No synthetic or random values are
generated at run time: when the dataset is missing or invalid the dashboard
reports the problem instead of inventing data.

Run it with:
    streamlit run python_dashboard/app.py
"""

from __future__ import annotations

import pathlib
from typing import Dict, List, Tuple

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATA_FILE = pathlib.Path(__file__).resolve().parents[1] / "data" / "sensor_data.csv"

# CSV header -> internal column name. The wording must match the recorded
# dataset exactly (the file is produced by the project simulation pipeline).
COLUMN_MAP: Dict[str, str] = {
    "Sample": "sample",
    "Soil moisture (%)": "soil",
    "Temperature (°C)": "temperature",
    "Air humidity (%)": "humidity",
    "Packet received": "received",
    "Pump": "pump",
}
OPTIONAL_COLUMN_MAP: Dict[str, str] = {"ML advice": "ml_advice"}

SOIL_LIMITS = (0.0, 100.0)
HUMIDITY_LIMITS = (0.0, 100.0)
TEMPERATURE_LIMITS = (-20.0, 60.0)

DEFAULT_DRY_THRESHOLD = 30
DEFAULT_WET_THRESHOLD = 40
DELIVERY_TARGET = 90.0

COLOR_SOIL = "#1f77b4"
COLOR_TEMPERATURE = "#d62728"
COLOR_HUMIDITY = "#2ca02c"
COLOR_PUMP = "#8e44ad"
COLOR_LOST = "#e74c3c"
COLOR_OK = "#27ae60"

PLOTLY_LAYOUT = dict(
    template="plotly_white",
    margin=dict(l=10, r=10, t=45, b=10),
    height=340,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
)

LEVEL_ERROR = "Critical"
LEVEL_WARNING = "Warning"
LEVEL_INFO = "Info"


class DataError(Exception):
    """Raised when the recorded dataset is missing or cannot be used."""


# ---------------------------------------------------------------------------
# Dataset loading and validation
# ---------------------------------------------------------------------------
def _to_bool(series: pd.Series) -> pd.Series:
    """Convert a CSV column to boolean, returning None for unknown tokens."""
    if series.dtype == bool:
        return series
    truthy = {"true", "1", "yes", "y", "on", "received", "ok"}
    falsy = {"false", "0", "no", "n", "off", "lost"}
    normalized = series.astype(str).str.strip().str.lower()
    return normalized.map(
        lambda value: True if value in truthy else (False if value in falsy else None)
    )


@st.cache_data(show_spinner=False)
def load_dataset(path: str, file_stamp: float) -> Tuple[pd.DataFrame, Dict[str, object]]:
    """Load and validate the recorded sensor dataset.

    ``file_stamp`` (file modification time) participates in the cache key so the
    dashboard reloads automatically when the CSV is regenerated.
    """
    file = pathlib.Path(path)
    if not file.is_file():
        raise DataError(
            f"Sensor dataset not found: {file}\n\n"
            "The dashboard expects the project CSV at <project>/data/sensor_data.csv."
        )
    try:
        raw = pd.read_csv(file)
    except Exception as exc:  # reported to the user instead of crashing
        raise DataError(f"'{file.name}' could not be parsed as CSV: {exc}") from exc

    if raw.empty:
        raise DataError(f"'{file.name}' does not contain any data row.")

    missing = [name for name in COLUMN_MAP if name not in raw.columns]
    if missing:
        raise DataError(
            "The dataset is missing required column(s): "
            + ", ".join(f"'{name}'" for name in missing)
        )

    issues: Dict[str, object] = {
        "rows_read": int(len(raw)),
        "invalid_numeric": 0,
        "invalid_received": 0,
        "invalid_pump": 0,
        "rows_dropped": 0,
        "duplicates": 0,
        "out_of_range": 0,
    }

    df = pd.DataFrame({alias: raw[column] for column, alias in COLUMN_MAP.items()})
    for column, alias in OPTIONAL_COLUMN_MAP.items():
        if column in raw.columns:
            df[alias] = raw[column]

    for column in ("sample", "soil", "temperature", "humidity"):
        converted = pd.to_numeric(df[column], errors="coerce")
        issues["invalid_numeric"] += int(df[column].notna().sum() - converted.notna().sum())
        df[column] = converted

    df["received"] = _to_bool(df["received"])
    issues["invalid_received"] = int(df["received"].isna().sum())
    df["pump"] = _to_bool(df["pump"])
    issues["invalid_pump"] = int(df["pump"].isna().sum())

    for column, (low, high) in (
        ("soil", SOIL_LIMITS),
        ("humidity", HUMIDITY_LIMITS),
        ("temperature", TEMPERATURE_LIMITS),
    ):
        mask = df[column].notna() & ((df[column] < low) | (df[column] > high))
        issues["out_of_range"] += int(mask.sum())

    rows_before = len(df)
    df = df.dropna(subset=["sample", "soil", "temperature", "humidity"])
    issues["rows_dropped"] = int(rows_before - len(df))
    if df.empty:
        raise DataError("No usable row remains after validation - check the dataset contents.")

    issues["duplicates"] = int(df.duplicated(subset=["sample"]).sum())
    df = df.drop_duplicates(subset=["sample"], keep="first")
    for column in ("received", "pump"):
        # astype("boolean") keeps unknown tokens as NA; they are then treated as
        # False and counted in issues so the operator can see them.
        df[column] = df[column].astype("boolean").fillna(False).astype(bool)
    df = df.sort_values("sample").reset_index(drop=True)

    issues["rows_used"] = int(len(df))
    issues["sample_range"] = f"{int(df['sample'].min())} - {int(df['sample'].max())}"
    issues["pump_on"] = int(df["pump"].sum())
    issues["received"] = int(df["received"].sum())
    return df, issues


# ---------------------------------------------------------------------------
# Analysis helpers
# ---------------------------------------------------------------------------
def replay_control(df: pd.DataFrame, dry: int, wet: int) -> pd.DataFrame:
    """Replay the documented hysteresis control law on the recorded samples.

    Documented behaviour (technical report, section 5):
      * soil moisture below the dry threshold -> pump ON
      * soil moisture above the wet threshold -> pump OFF
      * inside the hysteresis band            -> previous state is kept
      * lost packet                           -> previous state is kept
    """
    result = df.copy()
    state = 0
    pumps: List[int] = []
    actions: List[str] = []
    for received, soil in zip(result["received"], result["soil"]):
        if not received:
            action = "Hold - no telemetry"
        elif soil < dry:
            state, action = 1, "Irrigate - soil below dry threshold"
        elif soil > wet:
            state, action = 0, "Stop irrigation - soil above wet threshold"
        else:
            action = "Hold - inside hysteresis band"
        pumps.append(state)
        actions.append(action)
    result["recommended_pump"] = pumps
    result["action"] = actions
    result["agreement"] = result["pump"].astype(int) == result["recommended_pump"]
    return result


def loss_events(df: pd.DataFrame) -> List[Tuple[int, int]]:
    """Return ``(first_sample, length)`` for every run of consecutive losses."""
    events: List[Tuple[int, int]] = []
    start = None
    length = 0
    for sample, received in zip(df["sample"], df["received"]):
        if not received:
            if start is None:
                start, length = int(sample), 0
            length += 1
        elif start is not None:
            events.append((start, length))
            start, length = None, 0
    if start is not None:
        events.append((start, length))
    return events



def build_alerts(
    df: pd.DataFrame,
    dry: int,
    wet: int,
    delivery: float,
    issues: Dict[str, object],
) -> List[Tuple[str, str]]:
    """Build the operator alert list from the current dataset window."""
    alerts: List[Tuple[str, str]] = []
    last = df.iloc[-1]

    trailing_losses = 0
    for received in reversed(df["received"].tolist()):
        if received:
            break
        trailing_losses += 1
    if trailing_losses:
        level = LEVEL_ERROR if trailing_losses >= 3 else LEVEL_WARNING
        alerts.append(
            (
                level,
                f"No telemetry for the last {trailing_losses} sample(s): the irrigation "
                "decision is running on the last received state.",
            )
        )

    if last["soil"] < dry:
        alerts.append(
            (
                LEVEL_WARNING,
                f"Soil moisture is {last['soil']:.1f}% at the latest sample, below the dry "
                f"threshold ({dry}%): irrigation required.",
            )
        )
    elif last["soil"] > wet:
        alerts.append(
            (
                LEVEL_INFO,
                f"Soil moisture is {last['soil']:.1f}%, above the wet threshold ({wet}%): "
                "irrigation not required.",
            )
        )

    if delivery < 75.0:
        alerts.append(
            (
                LEVEL_ERROR,
                f"Packet delivery is {delivery:.1f}%: the LoRa link is severely degraded.",
            )
        )
    elif delivery < DELIVERY_TARGET:
        alerts.append(
            (
                LEVEL_WARNING,
                f"Packet delivery is {delivery:.1f}%: above the "
                f"{100 - DELIVERY_TARGET:.0f}% packet-loss target.",
            )
        )

    if last["temperature"] > 35.0:
        alerts.append(
            (
                LEVEL_WARNING,
                f"Air temperature is {last['temperature']:.1f} C: heat-stress risk for the crop.",
            )
        )
    if last["humidity"] < 25.0:
        alerts.append(
            (LEVEL_WARNING, f"Air humidity is {last['humidity']:.1f}%: air is too dry.")
        )
    if bool(last["pump"]) and last["soil"] > wet:
        alerts.append(
            (
                LEVEL_WARNING,
                "The recorded pump is ON while soil moisture is above the wet threshold: "
                "check the controller state.",
            )
        )
    if issues.get("out_of_range"):
        alerts.append(
            (
                LEVEL_WARNING,
                f"{issues['out_of_range']} sensor value(s) fall outside the physically "
                "plausible range.",
            )
        )
    if issues.get("rows_dropped"):
        alerts.append(
            (
                LEVEL_WARNING,
                f"{issues['rows_dropped']} row(s) were discarded because required values "
                "were missing.",
            )
        )
    if not alerts:
        alerts.append(
            (LEVEL_INFO, "All monitored parameters are inside their nominal operating range.")
        )
    return alerts


def overall_status(alerts: List[Tuple[str, str]]) -> Tuple[str, str]:
    """Return the (status label, emoji) derived from the most severe alert."""
    levels = {level for level, _ in alerts}
    if LEVEL_ERROR in levels:
        return "CRITICAL", "⛔"
    if LEVEL_WARNING in levels:
        return "ATTENTION REQUIRED", "⚠️"
    return "NOMINAL", "✅"


def sensor_statistics(df: pd.DataFrame) -> pd.DataFrame:
    """Summary statistics table for the three monitored parameters."""
    rows = []
    for label, column, unit in (
        ("Soil moisture", "soil", "%"),
        ("Air temperature", "temperature", "°C"),
        ("Air humidity", "humidity", "%"),
    ):
        series = df[column]
        rows.append(
            {
                "Parameter": label,
                "Unit": unit,
                "Mean": round(float(series.mean()), 2),
                "Minimum": round(float(series.min()), 2),
                "Maximum": round(float(series.max()), 2),
                "Std. deviation": round(float(series.std(ddof=0)), 2),
                "Latest value": round(float(series.iloc[-1]), 2),
            }
        )
    return pd.DataFrame(rows)



# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------
def soil_chart(df: pd.DataFrame, dry: int, wet: int) -> go.Figure:
    """Soil-moisture trend with the hysteresis band and lost packets marked."""
    fig = go.Figure()
    fig.add_hrect(
        y0=wet, y1=SOIL_LIMITS[1], fillcolor="rgba(39,174,96,0.10)", line_width=0,
        annotation_text="wet zone - irrigation not required",
        annotation_position="top left", annotation_font_size=11,
    )
    fig.add_hrect(
        y0=SOIL_LIMITS[0], y1=dry, fillcolor="rgba(231,76,60,0.10)", line_width=0,
        annotation_text="dry zone - irrigation required",
        annotation_position="bottom left", annotation_font_size=11,
    )
    fig.add_trace(
        go.Scatter(
            x=df["sample"], y=df["soil"], name="Soil moisture", mode="lines+markers",
            line=dict(color=COLOR_SOIL, width=2), marker=dict(size=5),
            hovertemplate="sample %{x}<br>%{y:.2f} %<extra></extra>",
        )
    )
    fig.add_hline(y=dry, line=dict(color=COLOR_LOST, dash="dash", width=1.5),
                  annotation_text=f"dry {dry}%", annotation_position="bottom right")
    fig.add_hline(y=wet, line=dict(color=COLOR_OK, dash="dash", width=1.5),
                  annotation_text=f"wet {wet}%", annotation_position="top right")
    lost = df[~df["received"]]
    if not lost.empty:
        fig.add_trace(
            go.Scatter(
                x=lost["sample"], y=lost["soil"], name="Packet lost", mode="markers",
                marker=dict(color=COLOR_LOST, size=11, symbol="x"),
                hovertemplate="sample %{x}<br>lost packet<extra></extra>",
            )
        )
    fig.update_layout(
        **PLOTLY_LAYOUT, title="Soil moisture",
        xaxis_title="Sample", yaxis_title="Soil moisture (%)",
        yaxis_range=[max(0, round(df["soil"].min()) - 5), min(100, round(df["soil"].max()) + 5)],
    )
    return fig


def environment_chart(df: pd.DataFrame, column: str, title: str, color: str, unit: str) -> go.Figure:
    """Line chart for a single environmental parameter with its mean."""
    series = df[column]
    mean_value = float(series.mean())
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df["sample"], y=series, name=title, mode="lines+markers",
            line=dict(color=color, width=2), marker=dict(size=5),
            hovertemplate=f"sample %{{x}}<br>%{{y:.2f}} {unit}<extra></extra>",
        )
    )
    fig.add_hline(
        y=mean_value, line=dict(color="#7f8c8d", dash="dot", width=1.2),
        annotation_text=f"mean {mean_value:.1f} {unit}", annotation_position="top right",
    )
    pad = max(1.0, float(series.max() - series.min()) * 0.25)
    fig.update_layout(
        **PLOTLY_LAYOUT, title=title, xaxis_title="Sample", yaxis_title=f"{title} ({unit})",
        yaxis_range=[float(series.min()) - pad, float(series.max()) + pad],
    )
    return fig


def reception_chart(df: pd.DataFrame) -> go.Figure:
    """Packet-reception timeline rendered as a status strip."""
    fig = go.Figure(
        go.Heatmap(
            z=[df["received"].astype(int).tolist()],
            x=df["sample"].tolist(),
            y=["LoRa packet"],
            colorscale=[[0.0, COLOR_LOST], [1.0, COLOR_OK]],
            zmin=0, zmax=1, showscale=False,
            hovertemplate="sample %{x}<br>status %{z}<extra></extra>",
        )
    )
    fig.update_layout(
        **{**PLOTLY_LAYOUT, "height": 200},
        title="Packet reception status (green = received, red = lost)",
        xaxis_title="Sample", yaxis_title="",
        yaxis=dict(showticklabels=True),
    )
    return fig


def cumulative_delivery_chart(df: pd.DataFrame) -> go.Figure:
    """Cumulative packet delivery ratio against the 90 % target."""
    received = df["received"].astype(int).cumsum()
    indexes = pd.Series(range(1, len(df) + 1), index=df.index)
    cumulative = received / indexes * 100.0
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df["sample"], y=cumulative, name="Cumulative delivery", mode="lines",
            line=dict(color=COLOR_SOIL, width=2),
            hovertemplate="sample %{x}<br>%{y:.2f} %<extra></extra>",
        )
    )
    fig.add_hline(
        y=DELIVERY_TARGET, line=dict(color="#f39c12", dash="dash", width=1.5),
        annotation_text=f"target {DELIVERY_TARGET:.0f} %", annotation_position="bottom right",
    )
    fig.update_layout(
        **PLOTLY_LAYOUT, title="Cumulative packet delivery ratio",
        xaxis_title="Sample", yaxis_title="Delivery ratio (%)",
        yaxis_range=[max(0, cumulative.min() - 5), 101],
    )
    return fig


def pump_chart(df: pd.DataFrame) -> go.Figure:
    """Recorded pump state against the replayed documented control law."""
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df["sample"], y=df["pump"].astype(int), name="Recorded pump (CSV)",
            mode="lines", line=dict(color=COLOR_PUMP, width=2.5, shape="hv"),
            hovertemplate="sample %{x}<br>recorded %{y}<extra></extra>",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df["sample"], y=df["recommended_pump"], name="Documented control law (replay)",
            mode="lines", line=dict(color=COLOR_OK, width=2, shape="hv", dash="dot"),
            hovertemplate="sample %{x}<br>replay %{y}<extra></extra>",
        )
    )
    fig.update_layout(
        **PLOTLY_LAYOUT, title="Pump command: recorded vs replayed control law",
        xaxis_title="Sample", yaxis_title="Pump state",
        yaxis=dict(tickmode="array", tickvals=[0, 1], ticktext=["OFF", "ON"], range=[-0.2, 1.2]),
    )
    return fig




# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Smart Farm | Monitoring & Irrigation",
    page_icon="🌱",
    layout="wide",
)

st.title("🌱 Smart Farm Monitoring & Automated Irrigation")
st.caption(
    "University engineering project • recorded sensor dataset • virtual LoRa link • "
    "automatic irrigation control"
)

try:
    file_stamp = DATA_FILE.stat().st_mtime if DATA_FILE.is_file() else 0.0
    df_all, issues = load_dataset(str(DATA_FILE), file_stamp)
except DataError as error:
    st.error("**The dashboard cannot start: the sensor dataset is not usable.**")
    st.code(str(error), language="text")
    st.info(
        "Expected file: `data/sensor_data.csv` (relative to the project root).\n\n"
        "The dashboard never falls back to synthetic values, so that every displayed "
        "number can be traced back to the recorded dataset."
    )
    st.stop()

# ---------------------------------------------------------------------------
# Sidebar controls
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("Controls")
    st.subheader("Dataset")
    st.caption(f"`{DATA_FILE.parent.name}/{DATA_FILE.name}`")
    st.caption(f"{issues['rows_used']} usable rows • samples {issues['sample_range']}")
    if st.button("Reload dataset", width="stretch"):
        load_dataset.clear()
        st.rerun()

    st.divider()
    st.subheader("Irrigation thresholds")
    dry_threshold = st.slider(
        "Dry threshold (%)", min_value=10, max_value=50, value=DEFAULT_DRY_THRESHOLD, step=1,
        help="Pump switches ON below this soil-moisture value.",
    )
    wet_threshold = st.slider(
        "Wet threshold (%)", min_value=dry_threshold + 1, max_value=80,
        value=max(DEFAULT_WET_THRESHOLD, dry_threshold + 5), step=1,
        help="Pump switches OFF above this soil-moisture value.",
    )

    st.divider()
    st.subheader("Display")
    sample_min = int(df_all["sample"].min())
    sample_max = int(df_all["sample"].max())
    if sample_max > sample_min:
        window = st.slider("Sample window", sample_min, sample_max, (sample_min, sample_max))
    else:
        window = (sample_min, sample_max)
        st.caption(f"Single sample available ({sample_min}).")

df = df_all[(df_all["sample"] >= window[0]) & (df_all["sample"] <= window[1])].copy()
if df.empty:
    st.warning("The selected sample window does not contain any data.")
    st.stop()

df = replay_control(df, dry_threshold, wet_threshold)

# ---------------------------------------------------------------------------
# Key indicators
# ---------------------------------------------------------------------------
received_count = int(df["received"].sum())
lost_count = int(len(df) - received_count)
delivery = 100.0 * received_count / len(df)
pump_on_recorded = int(df["pump"].sum())
pump_on_replayed = int(df["recommended_pump"].sum())
agreement = 100.0 * float(df["agreement"].mean())
events = loss_events(df)
longest_outage = max((length for _, length in events), default=0)

alerts = build_alerts(df, dry_threshold, wet_threshold, delivery, issues)
status_label, status_icon = overall_status(alerts)

banner = st.container(border=True)
with banner:
    left, right = st.columns([3, 1])
    with left:
        st.markdown(f"### {status_icon} System status: **{status_label}**")
        st.caption(
            f"Latest sample #{int(df['sample'].iloc[-1])} • soil "
            f"{df['soil'].iloc[-1]:.1f} % • air {df['temperature'].iloc[-1]:.1f} °C • "
            f"humidity {df['humidity'].iloc[-1]:.1f} % • pump "
            f"{'ON' if bool(df['pump'].iloc[-1]) else 'OFF'}"
        )
    with right:
        st.metric("Packet delivery", f"{delivery:.1f} %", border=False)

st.write("")

kpi1, kpi2, kpi3, kpi4 = st.columns(4)
kpi1.metric("Samples analysed", f"{len(df)}", border=True)
kpi2.metric("Mean soil moisture", f"{df['soil'].mean():.1f} %", border=True)
kpi3.metric("Mean air temperature", f"{df['temperature'].mean():.1f} °C", border=True)
kpi4.metric("Mean air humidity", f"{df['humidity'].mean():.1f} %", border=True)


# ---------------------------------------------------------------------------
# Tabs
# ---------------------------------------------------------------------------
tab_overview, tab_sensors, tab_comms, tab_irrigation, tab_quality, tab_data = st.tabs(
    [
        "Overview",
        "Sensor readings",
        "Communication",
        "Irrigation control",
        "Data quality",
        "Raw data",
    ]
)

with tab_overview:
    st.subheader("Active alerts")
    for level, message in alerts:
        if level == LEVEL_ERROR:
            st.error(message, icon="⛔")
        elif level == LEVEL_WARNING:
            st.warning(message, icon="⚠️")
        else:
            st.info(message, icon="ℹ️")

    st.subheader("Soil moisture and irrigation thresholds")
    st.plotly_chart(soil_chart(df, dry_threshold, wet_threshold), key="chart_soil_overview")

    summary_left, summary_right = st.columns(2)
    with summary_left:
        st.markdown("**Automatic irrigation**")
        st.markdown(
            f"- Dry threshold: **{dry_threshold} %** (pump ON below)\n"
            f"- Wet threshold: **{wet_threshold} %** (pump OFF above)\n"
            f"- Inside the band or after a lost packet: **previous state is kept**\n"
            f"- Recorded pump ON in **{pump_on_recorded}** of {len(df)} samples\n"
            f"- Replayed law would switch the pump ON in **{pump_on_replayed}** samples"
        )
    with summary_right:
        st.markdown("**Communication link**")
        st.markdown(
            f"- Packets received: **{received_count}** / {len(df)}\n"
            f"- Packets lost: **{lost_count}**\n"
            f"- Delivery ratio: **{delivery:.1f} %** (target ≥ {DELIVERY_TARGET:.0f} %)\n"
            f"- Loss events: **{len(events)}**, longest outage **{longest_outage}** sample(s)"
        )

with tab_sensors:
    st.subheader("Soil moisture")
    st.plotly_chart(soil_chart(df, dry_threshold, wet_threshold), key="chart_soil_sensors")
    temperature_column, humidity_column = st.columns(2)
    with temperature_column:
        st.plotly_chart(
            environment_chart(df, "temperature", "Air temperature", COLOR_TEMPERATURE, "°C"),
            key="chart_temperature",
        )
    with humidity_column:
        st.plotly_chart(
            environment_chart(df, "humidity", "Air humidity", COLOR_HUMIDITY, "%"),
            key="chart_humidity",
        )
    st.subheader("Measured statistics")
    st.dataframe(sensor_statistics(df), hide_index=True, key="df_sensor_stats")

with tab_comms:
    comms1, comms2, comms3, comms4 = st.columns(4)
    comms1.metric("Packets received", f"{received_count}", border=True)
    comms2.metric("Packets lost", f"{lost_count}", border=True)
    comms3.metric("Loss events", f"{len(events)}", border=True)
    comms4.metric("Longest outage", f"{longest_outage} sample(s)", border=True)

    st.plotly_chart(reception_chart(df), key="chart_reception")
    st.plotly_chart(cumulative_delivery_chart(df), key="chart_cumulative")

    if events:
        st.subheader("Packet-loss events")
        st.dataframe(
            pd.DataFrame(
                [
                    {"First sample": first, "Consecutive samples lost": length}
                    for first, length in events
                ]
            ),
            hide_index=True,
            key="df_events",
        )
    else:
        st.success("No packet loss was recorded in the selected window.")

    st.caption(
        "The recorded dataset provides packet reception only; no RSSI/SNR measurement "
        "is available, so the dashboard reports measured link statistics instead of "
        "estimated radio values."
    )

with tab_irrigation:
    irr1, irr2, irr3 = st.columns(3)
    irr1.metric("Pump ON - recorded", f"{pump_on_recorded} sample(s)", border=True)
    irr2.metric("Pump ON - documented law", f"{pump_on_replayed} sample(s)", border=True)
    irr3.metric("Control-law agreement", f"{agreement:.1f} %", border=True)

    st.plotly_chart(pump_chart(df), key="chart_pump")

    st.subheader("Automatic recommendation - latest samples")
    latest = df.tail(15).copy()
    latest_table = pd.DataFrame(
        {
            "Sample": latest["sample"].astype(int),
            "Soil moisture (%)": latest["soil"].round(2),
            "Packet": latest["received"].map({True: "received", False: "lost"}),
            "Recorded pump": latest["pump"].map({True: "ON", False: "OFF"}),
            "Recommended pump": latest["recommended_pump"].map({1: "ON", 0: "OFF"}),
            "Automatic recommendation": latest["action"],
        }
    )
    if "ml_advice" in latest.columns:
        latest_table["ML advice (dataset)"] = latest["ml_advice"].astype(str)
    st.dataframe(latest_table, hide_index=True, key="df_latest")
    st.caption(
        "The recommendation column is produced by replaying the documented hysteresis "
        "law on the recorded soil-moisture and packet-reception values."
    )


with tab_quality:
    st.subheader("Validation checks")
    checks = pd.DataFrame(
        [
            {
                "Check": "Dataset file",
                "Value": f"{DATA_FILE.parent.name}/{DATA_FILE.name}",
                "Status": "OK",
            },
            {
                "Check": "Rows read / used",
                "Value": f"{issues['rows_read']} / {issues['rows_used']}",
                "Status": "OK",
            },
            {
                "Check": "Sample index range",
                "Value": str(issues["sample_range"]),
                "Status": "OK",
            },
            {
                "Check": "Duplicate sample indices",
                "Value": str(issues["duplicates"]),
                "Status": "OK" if not issues["duplicates"] else "Check",
            },
            {
                "Check": "Non-numeric sensor values",
                "Value": str(issues["invalid_numeric"]),
                "Status": "OK" if not issues["invalid_numeric"] else "Check",
            },
            {
                "Check": "Unparsable packet status values",
                "Value": str(issues["invalid_received"]),
                "Status": "OK" if not issues["invalid_received"] else "Check",
            },
            {
                "Check": "Unparsable pump values",
                "Value": str(issues["invalid_pump"]),
                "Status": "OK" if not issues["invalid_pump"] else "Check",
            },
            {
                "Check": "Rows dropped (missing values)",
                "Value": str(issues["rows_dropped"]),
                "Status": "OK" if not issues["rows_dropped"] else "Check",
            },
            {
                "Check": "Values outside physical range",
                "Value": str(issues["out_of_range"]),
                "Status": "OK" if not issues["out_of_range"] else "Check",
            },
            {
                "Check": "Control-law agreement with recorded pump",
                "Value": f"{agreement:.1f} %",
                "Status": "OK" if agreement >= 99.0 else "Check",
            },
        ]
    )
    st.dataframe(checks, hide_index=True, key="df_checks")
    st.caption(
        "Physical ranges: soil moisture 0-100 %, air humidity 0-100 %, "
        "air temperature -20 to 60 °C."
    )

    if agreement < 99.0:
        st.warning(
            f"The recorded pump differs from the replayed documented law on "
            f"{int((~df['agreement']).sum())} sample(s). This usually means the dataset "
            "was produced with different thresholds than the ones selected in the sidebar."
        )

with tab_data:
    st.subheader("Recorded dataset")
    table = pd.DataFrame(
        {
            "Sample": df["sample"].astype(int),
            "Soil moisture (%)": df["soil"].round(3),
            "Temperature (°C)": df["temperature"].round(3),
            "Air humidity (%)": df["humidity"].round(3),
            "Packet received": df["received"].map({True: "True", False: "False"}),
            "Pump": df["pump"].map({True: "ON", False: "OFF"}),
            "Recommended pump": df["recommended_pump"].map({1: "ON", 0: "OFF"}),
        }
    )
    if "ml_advice" in df.columns:
        table["ML advice (dataset)"] = df["ml_advice"].astype(str)
    st.dataframe(table, hide_index=True, height=420, key="df_raw")
    st.download_button(
        "Download analysed data (CSV)",
        table.to_csv(index=False).encode("utf-8"),
        "smart_farm_analysed.csv",
        "text/csv",
    )

st.divider()
st.caption(
    f"Data source: `{DATA_FILE.parent.name}/{DATA_FILE.name}` - recorded dataset, "
    f"{issues['rows_read']} row(s). No synthetic values are generated at run time. "
    f"Replayed control law: hysteresis {dry_threshold} % / {wet_threshold} % with "
    "hold-on-packet-loss."
)


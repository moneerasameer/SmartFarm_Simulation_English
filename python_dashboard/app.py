import streamlit as st
import numpy as np
import pandas as pd
import plotly.express as px
from sklearn.tree import DecisionTreeClassifier

st.set_page_config(page_title="Smart Farm | LoRa Simulation", page_icon="🌱", layout="wide")
st.title("🌱 Smart Farm — LoRa and Irrigation Simulation")
st.caption("Software-only prototype • synthetic sensor data • virtual LoRa link (no RF transmission)")

with st.sidebar:
    st.header("Simulation controls")
    samples = st.slider("Number of samples", 30, 300, 120, 10)
    distance = st.slider("Virtual LoRa distance (m)", 50, 2000, 450, 50)
    loss_pct = st.slider("Packet loss probability (%)", 0, 30, 4)
    dry_limit = st.slider("Dry threshold (%)", 10, 50, 30)
    wet_limit = st.slider("Wet threshold (%)", dry_limit + 1, 70, max(40, dry_limit + 10))
    seed = st.number_input("Random seed", min_value=0, max_value=9999, value=7)

rng = np.random.default_rng(int(seed))
t = np.arange(samples)
soil = np.clip(42 + 17*np.sin((t-15)/18) + rng.normal(0, 4, samples), 5, 95)
temp = 24 + 5*np.sin(t/28) + rng.normal(0, 1.2, samples)
rh = np.clip(58 - 12*np.sin(t/28) + rng.normal(0, 3, samples), 20, 95)
received = rng.random(samples) >= loss_pct/100

pump, state = [], 0
for i in range(samples):
    if received[i]:
        if soil[i] < dry_limit:
            state = 1
        elif soil[i] > wet_limit:
            state = 0
    pump.append(state)

# Demonstration-only ML model trained on synthetic data.
train_rng = np.random.default_rng(2026)
X = np.column_stack([train_rng.uniform(5,95,1500),
                     train_rng.uniform(5,45,1500),
                     train_rng.uniform(20,95,1500)])
y = ((X[:,0] < 30) & (X[:,1] > 18)).astype(int)
model = DecisionTreeClassifier(max_depth=3, random_state=1).fit(X, y)
ml_advice = model.predict(np.column_stack([soil, temp, rh]))

df = pd.DataFrame({
    "Sample": t, "Soil moisture (%)": soil, "Temperature (°C)": temp,
    "Air humidity (%)": rh, "Packet received": received,
    "Pump": np.where(np.array(pump)==1, "ON", "OFF"),
    "ML advice": np.where(ml_advice==1, "Irrigation suggested", "No irrigation")
})

path_loss = 105 + 20*np.log10(max(distance,1)/100)
rssi = 14 - path_loss
snr = 8.5 - 20*np.log10(max(distance,1)/100)
delivery = 100 * received.mean()

c1,c2,c3,c4 = st.columns(4)
c1.metric("Packet delivery", f"{delivery:.1f}%")
c2.metric("Estimated RSSI", f"{rssi:.1f} dBm")
c3.metric("Estimated SNR", f"{snr:.1f} dB")
c4.metric("Pump ON", f"{sum(pump)} samples")

left,right = st.columns(2)
with left:
    st.subheader("Soil and air humidity")
    st.plotly_chart(px.line(df, x="Sample", y=["Soil moisture (%)","Air humidity (%)"]), use_container_width=True)
with right:
    st.subheader("Air temperature")
    st.plotly_chart(px.line(df, x="Sample", y="Temperature (°C)"), use_container_width=True)

st.subheader("Automatic irrigation")
pump_df = pd.DataFrame({"Sample":t, "Pump state":pump})
st.plotly_chart(px.line(pump_df, x="Sample", y="Pump state", line_shape="hv",
                        title="Pump state (0 = OFF, 1 = ON)"), use_container_width=True)
st.subheader("Latest simulated packets")
st.dataframe(df.tail(15), use_container_width=True)
st.info("The pump turns ON below the dry threshold and OFF above the wet threshold. Between thresholds, it keeps its previous state. If a packet is lost, the previous state is retained.")
st.warning("LoRa is emulated in software. RSSI/SNR are illustrative estimates, not measured radio values. The ML model uses synthetic training data and is not an agronomic recommendation.")
st.download_button("Download simulated data (CSV)", df.to_csv(index=False).encode("utf-8"),
                   "smart_farm_simulation.csv", "text/csv")

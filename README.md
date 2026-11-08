# Smart Farm Simulation (No Hardware Required)

This is a **software-only simulation** of a smart agriculture system using a virtual LoRa communication link. It does not perform real radio transmission.

## Included
- `matlab/smart_farm_simulation.m`: synthetic soil/air sensor data, virtual packet delivery/loss, irrigation control and plots.
- `vhdl/irrigation_controller.vhd`: synthesizable-style RTL description of a digital irrigation controller.
- `systemc/smart_farm_systemc.cpp`: simplified clocked SystemC model.
- `python_dashboard/app.py`: interactive Streamlit dashboard, virtual LoRa metrics, synthetic sensor data and an illustrative ML classifier.

## Software
1. MATLAB (or GNU Octave, subject to minor compatibility differences).
2. A VHDL simulator such as GHDL.
3. SystemC and a C++ compiler.
4. Python 3.10+.

No ESP32, Arduino, sensors, pump or LoRa radio modules are required for this simulation.

## Run the dashboard
Open a terminal in `python_dashboard`:
```bash
pip install -r requirements.txt
streamlit run app.py
```

## Run MATLAB
Open `matlab/smart_farm_simulation.m` in MATLAB and press Run.

## Analyze VHDL with GHDL
```bash
ghdl -a --std=08 vhdl/irrigation_controller.vhd
ghdl -e --std=08 irrigation_controller
```
This analyzes and elaborates the design. A dedicated testbench should be added for full signal-level verification.

## Build SystemC
Set `SYSTEMC_HOME` to your SystemC installation. A typical Linux command is:
```bash
g++ -I$SYSTEMC_HOME/include -L$SYSTEMC_HOME/lib-linux64 systemc/smart_farm_systemc.cpp -lsystemc -o smart_farm_systemc
./smart_farm_systemc
```
Library folder names vary by installation and operating system.

## Important limitations
- Sensor values are generated synthetically, not measured from real sensors.
- LoRa is represented by a software packet model. There is no RF transmission.
- RSSI/SNR values are illustrative estimates, not measured radio values.
- The ML example is trained on synthetic data and is for demonstration only.
- Real LoRa range, energy consumption and field performance cannot be validated without physical hardware.

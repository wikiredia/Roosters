//! Laadvermogen in de menubalk (enkel Mac): een bliksem met bv. `45 W` zolang er stroom je Mac
//! in gaat, weg zodra de lader eruit is. De cijfers komen uit `ioreg -rn AppleSmartBattery`.
//!
//! - Apple-chip: `PowerTelemetryData` → `SystemPowerIn` (mW), wat er echt uit de lader komt.
//! - Intel (geen telemetrie): spanning × stroom naar de batterij, enkel als die laadt.

#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

/// Onder deze waarde (mW) tellen we het niet als laden
const MIN_MW: i64 = 500;

#[derive(Debug, PartialEq)]
pub struct Power {
    /// Vermogen dat binnenkomt, in watt (afgerond)
    pub watts: u32,
    /// Wat de lader belooft (`AdapterDetails` → `Watts`), als de Mac het weet
    pub adapter_watts: Option<u32>,
    /// Batterij in procent
    pub percent: Option<u32>,
}

impl Power {
    pub fn title(&self) -> String {
        format!("{} W", self.watts)
    }

    pub fn tooltip(&self) -> String {
        let mut t = format!("Laadt met {} W", self.watts);
        if let Some(a) = self.adapter_watts {
            t += &format!(" (lader {a} W)");
        }
        if let Some(p) = self.percent {
            t += &format!(" · batterij {p}%");
        }
        t
    }
}

/// Eerste geheel getal na `"key" =` of `"key"=` (ioreg zet negatieve waarden als u64)
fn int(text: &str, key: &str) -> Option<i64> {
    let needle = format!("\"{key}\"");
    let mut rest = text;
    while let Some(i) = rest.find(&needle) {
        rest = &rest[i + needle.len()..];
        let after = rest.trim_start();
        let Some(after) = after.strip_prefix('=') else { continue };
        let digits: String = after.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
        return digits.parse::<u64>().ok().map(|v| v as i64);
    }
    None
}

fn yes(text: &str, key: &str) -> bool {
    text.lines().any(|l| {
        let l = l.trim();
        l.starts_with(&format!("\"{key}\"")) && l.ends_with("Yes")
    })
}

/// Uitvoer van `ioreg -rn AppleSmartBattery` → vermogen, of None als er niets binnenkomt
pub fn parse(ioreg: &str) -> Option<Power> {
    if !yes(ioreg, "ExternalConnected") {
        return None;
    }
    let mw = match int(ioreg, "SystemPowerIn") {
        Some(mw) => mw,
        None => {
            let mv = int(ioreg, "Voltage")?;
            let ma = int(ioreg, "InstantAmperage").or_else(|| int(ioreg, "Amperage"))?;
            mv * ma / 1000
        }
    };
    if mw < MIN_MW {
        return None;
    }
    let percent = match (int(ioreg, "CurrentCapacity"), int(ioreg, "MaxCapacity")) {
        (Some(c), Some(m)) if m > 0 => Some((c * 100 / m).clamp(0, 100) as u32),
        _ => None,
    };
    Some(Power {
        watts: ((mw + 500) / 1000) as u32,
        adapter_watts: int(ioreg, "Watts").filter(|w| *w > 0).map(|w| w as u32),
        percent,
    })
}

#[cfg(target_os = "macos")]
pub fn read() -> Option<Power> {
    let out = std::process::Command::new("/usr/sbin/ioreg").args(["-rn", "AppleSmartBattery"]).output().ok()?;
    parse(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    const APPLE: &str = r#"+-o AppleSmartBattery  <class AppleSmartBattery>
    {
      "PowerTelemetryData" = {"WallEnergyEstimate"=123,"SystemPowerIn"=44612,"SystemVoltageIn"=20090,"SystemCurrentIn"=2220}
      "ExternalConnected" = Yes
      "AdapterDetails" = {"AdapterVoltage"=20000,"Watts"=96,"Current"=4700}
      "Voltage" = 12923
      "Amperage" = 1520
      "CurrentCapacity" = 81
      "MaxCapacity" = 100
      "IsCharging" = Yes
    }"#;

    #[test]
    fn apple_silicon() {
        let p = parse(APPLE).unwrap();
        assert_eq!(p, Power { watts: 45, adapter_watts: Some(96), percent: Some(81) });
        assert_eq!(p.title(), "45 W");
        assert_eq!(p.tooltip(), "Laadt met 45 W (lader 96 W) · batterij 81%");
    }

    #[test]
    fn unplugged() {
        assert!(parse(&APPLE.replace("\"ExternalConnected\" = Yes", "\"ExternalConnected\" = No")).is_none());
        assert!(parse(&APPLE.replace("44612", "120")).is_none());
        assert!(parse("").is_none());
    }

    #[test]
    fn intel() {
        let text = r#"
      "ExternalConnected" = Yes
      "Voltage" = 12500
      "InstantAmperage" = 2400
      "CurrentCapacity" = 3000
      "MaxCapacity" = 6000
"#;
        assert_eq!(parse(text).unwrap(), Power { watts: 30, adapter_watts: None, percent: Some(50) });
        // Lader erin maar de batterij loopt leeg (negatieve stroom als u64): niets tonen
        assert!(parse(&text.replace("2400", "18446744073709550616")).is_none());
    }
}

/**
 * AcademicFlow's three built-in graphical-abstract starters, snapshotted verbatim from
 * GET /v1/starters/<name>.
 *
 * They serve two purposes: they are the few-shot examples in the prompt, and they are the
 * fixtures that prove the Zod mirror in ./spec.ts accepts everything the real engine
 * accepts. If a starter stops parsing, the mirror has drifted from flow-app — that is the
 * signal to regenerate, not to loosen the schema.
 */

export const PIPELINE_STARTER = {
    "version": 1,
    "type": "graphical-abstract",
    "layout": "pipeline",
    "preset": "ga-wide",
    "arrows": true,
    "title": "Condition-Related Mortality in the United States (1999–2023)",
    "subtitle": "Trends and Disparities in Adults Aged ≥25 Years",
    "theme": {
      "accent": "#1e3a5f"
    },
    "panels": [
      {
        "label": "1. RISK FACTOR",
        "color": "#2c5282",
        "heading": "Hypertension",
        "body": "Persistent high blood pressure damages the heart and blood vessels.",
        "figure": "dv-bp-monitor",
        "figureH": 150
      },
      {
        "label": "2. DISEASE",
        "color": "#b91c1c",
        "heading": "Cardiomyopathy",
        "body": "Long-term exposure contributes to disease and weakening of the heart muscle.",
        "figure": "sd-heart",
        "figureH": 150
      },
      {
        "label": "3. NATIONAL TRENDS",
        "color": "#15803d",
        "flex": 1.3,
        "stat": {
          "value": "153,563 deaths",
          "size": 19,
          "color": "#15803d",
          "label": "attributable to the condition"
        },
        "body": "Age-adjusted mortality rate (per 100,000)",
        "chart": {
          "kind": "line",
          "labels": [
            "1999",
            "2005",
            "2011",
            "2017",
            "2023"
          ],
          "series": [
            {
              "name": "AAMR",
              "color": "#15803d",
              "values": [
                1.26,
                2.58,
                2.36,
                2.1,
                2.22
              ]
            }
          ],
          "yLabel": "Rate per 100,000",
          "xLabel": "Year",
          "showGrid": true,
          "yMin": 0,
          "annotations": [
            {
              "x": "2005",
              "text": "Peak (APC +30.3%*)",
              "color": "#b91c1c",
              "dy": -26
            }
          ]
        },
        "chartH": 190,
        "note": "AAMR increased from 1.26 in 1999 to 2.22 in 2023"
      },
      {
        "label": "4. KEY DISPARITIES",
        "color": "#6d28d9",
        "flex": 1.1,
        "items": [
          {
            "figure": "pp-man",
            "title": "Higher in men",
            "text": "AAMR 2.98 vs 1.61 in women"
          },
          {
            "figure": "pp-group3",
            "title": "Highest in Non-Hispanic Black adults",
            "text": "AAMR 10.81 vs 5.02"
          },
          {
            "figure": "gg-rural",
            "title": "Higher in non-metropolitan areas",
            "text": "AAMR 2.71 vs 2.26"
          },
          {
            "figure": "gg-us-map",
            "title": "Highest regional burden in the South",
            "text": "AAMR 4.86"
          },
          {
            "figure": "pp-elderly-couple",
            "title": "Highest in adults ≥85 years",
            "text": "CMR 32.79 (APC +2.44* after 2015)"
          }
        ]
      }
    ],
    "footer": {
      "items": [
        {
          "figure": "dv-bp-monitor",
          "text": "Improve risk-factor control"
        },
        {
          "figure": "hi-heart",
          "text": "Early diagnosis and management"
        },
        {
          "figure": "pp-caring-hands",
          "text": "Equitable access to care"
        }
      ],
      "result": {
        "figure": "mt-trend-down",
        "text": "Reduced mortality and health disparities"
      }
    },
    "source": "Data source: national multiple-cause-of-death database (1999–2023)  |  AAMR: age-adjusted mortality rate  |  APC: annual percent change  |  * p < 0.05"
  } as const;

export const OUTCOMES_STARTER = {
    "version": 1,
    "type": "graphical-abstract",
    "layout": "outcomes",
    "preset": "ga-wide",
    "title": "Drug A vs Drug B in Acute Care: A Systematic Review and Meta-analysis",
    "titleStyle": "plain",
    "theme": {
      "accent": "#1e3a5f"
    },
    "panels": [
      {
        "label": "STUDY DESIGN",
        "headerBand": true,
        "color": "#1e3a5f",
        "body": "Systematic review and meta-analysis",
        "figure": "ev-prisma-clipboard",
        "figureH": 96,
        "note": "PubMed, Cochrane Library, ClinicalTrials.gov — registered in PROSPERO"
      },
      {
        "label": "POPULATION",
        "headerBand": true,
        "color": "#1e3a5f",
        "stat": {
          "value": "1,378 patients",
          "size": 17,
          "label": "from 9 studies (8 cohorts, 1 RCT)"
        },
        "figure": "pp-group3",
        "figureH": 92
      },
      {
        "label": "INTERVENTIONS",
        "headerBand": true,
        "color": "#1e3a5f",
        "items": [
          {
            "figure": "dv-iv-bag",
            "title": "Drug A",
            "text": "intravenous infusion"
          },
          {
            "figure": "dv-infusion-pump",
            "title": "Drug B",
            "text": "intravenous infusion"
          }
        ]
      },
      {
        "label": "OUTCOMES & RESULTS",
        "headerBand": true,
        "color": "#1e3a5f",
        "flex": 1.5,
        "rows": [
          {
            "figure": "mt-clock",
            "label": "Time to target (minutes)",
            "value": "MD −6.27 (95% CI −16.96 to 4.42) — ns"
          },
          {
            "figure": "mt-target",
            "label": "% time within target range",
            "value": "MD 2.08 (95% CI −1.53 to 5.69) — ns"
          },
          {
            "figure": "dv-hospital-bed",
            "label": "ICU & hospital stay",
            "value": "No significant difference"
          },
          {
            "figure": "hi-heart",
            "label": "Safety outcomes",
            "value": "No significant difference"
          },
          {
            "figure": "ev-forest-plot",
            "label": "Infusion volume (mL)",
            "value": "MD −582.83 (95% CI −860.49 to −305.18)",
            "valueColor": "#b91c1c"
          }
        ]
      }
    ],
    "boxes": [
      {
        "label": "SUBGROUP ANALYSIS",
        "color": "#2c5282",
        "tint": "#f2f6fc",
        "items": [
          {
            "figure": "hi-brain",
            "title": "Neurocritical care",
            "text": "MD −20.09 min (95% CI −37.90 to −2.21)"
          },
          {
            "figure": "pp-person",
            "title": "General acute care",
            "text": "MD −2.79 min (95% CI −3.43 to −2.14)"
          }
        ]
      },
      {
        "label": "CERTAINTY OF EVIDENCE (GRADE)",
        "color": "#1e3a5f",
        "tint": "#f2f6fc",
        "figure": "ev-grade-shield",
        "figureH": 70,
        "heading": "Moderate",
        "body": "for all outcomes"
      }
    ],
    "conclusion": {
      "label": "CONCLUSION",
      "figure": "ev-balance-scales",
      "text": "Both agents show comparable efficacy and safety. Drug A requires a lower infusion volume and reaches the target faster in subgroup analyses, but no overall clinical superiority was demonstrated. Larger randomised trials are needed."
    },
    "source": "MD: mean difference  |  CI: confidence interval  |  ns: not significant"
  } as const;

export const BMR_STARTER = {
    "version": 1,
    "type": "graphical-abstract",
    "layout": "bmr",
    "preset": "ga-wide",
    "arrows": true,
    "title": "Predictors of Mortality in a Single-Centre Cohort",
    "theme": {
      "accent": "#1e3a5f"
    },
    "panels": [
      {
        "label": "Background",
        "headerBand": true,
        "color": "#1e3a5f",
        "align": "start",
        "bullets": [
          "High cardiovascular mortality",
          "Comorbidity as a risk factor",
          "Heterogeneity of treatment exposure",
          "Competing events at follow-up"
        ]
      },
      {
        "label": "Methods",
        "headerBand": true,
        "color": "#2c5282",
        "align": "start",
        "bullets": [
          "749 patients, single-centre cohort",
          "Competing-risk regression model",
          "Prespecified subgroup comparison",
          "Median follow-up 36 months"
        ]
      },
      {
        "label": "Results",
        "headerBand": true,
        "color": "#15803d",
        "align": "start",
        "bullets": [
          "Disease severity",
          "Age",
          "Left atrial diameter",
          "Right ventricular diameter",
          "Exposure-specific predictors"
        ]
      }
    ],
    "strip": {
      "figures": [
        {
          "figure": "hi-kidneys",
          "caption": "Organ involvement"
        },
        {
          "figure": "mt-stat-bars",
          "caption": "Risk model"
        },
        {
          "figure": "sd-lungs",
          "caption": "Haemodynamic burden"
        },
        {
          "figure": "ev-forest-plot",
          "caption": "Independent predictors"
        }
      ],
      "height": 120,
      "arrows": true
    },
    "conclusion": {
      "label": "CONCLUSION",
      "text": "Severity of disease tracks structural remodelling and supports individualised cardiovascular risk stratification."
    },
    "source": "Single-centre retrospective cohort — competing-risk analysis"
  } as const;

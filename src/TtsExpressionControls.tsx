import { ChevronDown } from "lucide-react";
import {
  ttsEmotionOptions,
  ttsIntonationOptions,
  ttsReadingStyleOptions,
  ttsToneOptions,
  type TtsExpressionConfig,
} from "./plugins/builtin/manim/ttsConfig";

type TtsExpressionControlsProps = {
  value: TtsExpressionConfig;
  onChange: (patch: Partial<TtsExpressionConfig>) => void;
  compact?: boolean;
};

type ExpressionSelectProps = {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
};

function ExpressionSelect({ label, value, options, onChange }: ExpressionSelectProps) {
  return <label>
    <span>{label}</span>
    <div className="tts-expression-select">
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-label={label}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <ChevronDown size={14}/>
    </div>
  </label>;
}

export function TtsExpressionControls({ value, onChange, compact = false }: TtsExpressionControlsProps) {
  return <div className={`tts-expression-controls ${compact ? "compact" : ""}`}>
    <ExpressionSelect label="情感" value={value.emotion} options={ttsEmotionOptions} onChange={(emotion) => onChange({ emotion: emotion as TtsExpressionConfig["emotion"] })}/>
    <ExpressionSelect label="语气" value={value.tone} options={ttsToneOptions} onChange={(tone) => onChange({ tone: tone as TtsExpressionConfig["tone"] })}/>
    <ExpressionSelect label="语调" value={value.intonation} options={ttsIntonationOptions} onChange={(intonation) => onChange({ intonation: intonation as TtsExpressionConfig["intonation"] })}/>
    <ExpressionSelect label="朗读风格" value={value.readingStyle} options={ttsReadingStyleOptions} onChange={(readingStyle) => onChange({ readingStyle: readingStyle as TtsExpressionConfig["readingStyle"] })}/>
    <label className="tts-expression-custom">
      <span>自定义要求 <small>{value.customInstruction.length}/200</small></span>
      <input value={value.customInstruction} onChange={(event) => onChange({ customInstruction: event.currentTarget.value.slice(0, 200) })} maxLength={200} placeholder="例如：遇到关键词时稍作停顿"/>
    </label>
  </div>;
}

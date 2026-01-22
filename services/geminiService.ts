import { GoogleGenAI, Type } from "@google/genai";
import { SmartParseResult } from "../types";

export const parseInvoiceText = async (text: string): Promise<SmartParseResult> => {
  if (!process.env.API_KEY) {
    console.warn("API Key is missing. Returning empty object.");
    return {};
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-latest",
      contents: `Extract invoice data from the following text into a structured JSON. 
      Text: "${text}"
      
      If a value is missing, ignore it. 
      For currency values, return them as numbers (float). 
      For date, return in YYYY-MM-DD format if possible.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Date in YYYY-MM-DD" },
            cargoType: { type: Type.STRING, description: "Type of cargo or service" },
            driver: { type: Type.STRING, description: "Name of the driver" },
            plate: { type: Type.STRING, description: "Vehicle license plate" },
            cargoValue: { type: Type.NUMBER, description: "Value of the cargo" },
            icms: { type: Type.NUMBER, description: "ICMS tax value" },
            insuranceValue: { type: Type.NUMBER, description: "Insurance cost" },
            totalExpense: { type: Type.NUMBER, description: "Total expense/freight cost" },
          },
        },
      },
    });

    const jsonText = response.text;
    if (!jsonText) return {};
    
    return JSON.parse(jsonText) as SmartParseResult;

  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return {};
  }
};
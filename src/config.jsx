export const GEMINI_API_KEY = 'AIzaSyAoaAQjhN0Kc_89ZEZ0AR-l20zQBQ9QerQ';


// AIzaSyDKaz9qXUXf4jkyCtsoc0WYtZxz-h1KU4c

// const queryGemini = async (prompt) => {
//     try {
//       const res = await fetch(
//         `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
//         {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             contents: [{ role: "user", parts: [{ text: prompt }] }], 
//           }),
//         }
//       );
//       const data = await res.json();
//       const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't understand that.";
      
//       // Limit to 30 words
//       const words = responseText.split(" ");
//       const limitedResponse = words.slice(0, 50).join(" ");
      
//       return limitedResponse;
//     } catch (err) {
//       return "Something went wrong while contacting Gemini.";
//     }
//   };
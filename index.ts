import "dotenv/config"; // use `.env` variables
import { 
  TAC, 
  TACConfig, 
  TACServer, 
  VoiceChannel,
  TACMemoryResponse, 
  MemoryPromptBuilder, 
  GPTLiveProviderConfig, 
  TWILIO_AUDIO_FORMAT_FOR_GPT_LIVE
} from "twilio-agent-connect";

// Create a Twilio Agent Connect client from the environment variables
// This will be used throughout the application
const tac = await TAC.create({ config: TACConfig.fromEnv() });

const BASE_INSTRUCTIONS = `
  You are a warm, concise agent for coffee shop called Pat and Huey's Coffee that
  takes orders from both new and old customesr. You offer a wide range of coffees and small
  bakery items like croissants, as well as specials for the day! This is NOT a real coffee shop
  so don't ask for an address or payment details. Instead, pretend that their order will be
  ready as soon as the customer hangs up. Make sure to greet them, be concise, and generally helpful.
`;

// Abstracted, that way we can have a default session configuration 
// and also one that is modified with Conversation Memory instructions
const sessionConfig = (instructions?: string) => ({
  model: "gpt-live-1",
  instructions,
  audio: {
    format: TWILIO_AUDIO_FORMAT_FOR_GPT_LIVE,
    output: { voice: "marin" }
  },
  delegation: {
    type: "responses",
    responses: { 
      model: "gpt-6.1-sol",
      tool_choice: "auto"
    }
  }
});


// This Voice Channel will handle voice-based conversations over a WebSocket
// Additionally, this will be configured with a GPT Live specific provider
// which will use the `sessionConfig` object with the base and modified instructions
const voice = new VoiceChannel(tac, new GPTLiveProviderConfig({
  welcomeInstruction: `
    Greet the caller immediately then listen for any requests and note if they are
    a repeat customer like "Hello Alex, thank you for choosing Pat and Huey's again for 
    your coffee needs. Would you like your usual order?" If they're new to your memory,
    be friendly and make sure to ask for their name and what they would like to order.
  `,

  defaultSessionConfig: sessionConfig(BASE_INSTRUCTIONS),

  onInboundCallSessionConfig: async (req) => {
    // Get the current caller's number
    const number = req.from;
    if (req.callSid && number) {
      // Get the Conversation Memory for this caller (see function definition)
      const memory = await recallMemory(number);

      // Use the built in `MemoryPromptBuilder` and return a modified session configuration
      const instructions = MemoryPromptBuilder.compose(BASE_INSTRUCTIONS, memory);
      return sessionConfig(instructions);
    }

    // otherwise return the default session configuration
    return sessionConfig();
  }
}));

async function recallMemory(number: string) {
  const memoryClient = tac.getMemoryClient();
  if (!memoryClient) return undefined;

  try {
    // See if the caller has an existent profile in memory
    const lookup = await memoryClient.lookupProfile("phone", number);
    const profileId = lookup.profiles?.[0];
    if (!profileId) return undefined;

    // If so, retrieve associated memories, query to ask for specific traits
    // The order traits are custom traits for this Conversation app
    // and configured under Memory, via Console or API
    const memories = await memoryClient.retrieveMemories(profileId, {
      query: "caller's name, usual order, and past orders"
    });

    // Return a formatted Memory response
    return new TACMemoryResponse(memories);
    
  }
  catch {
    return undefined;
  }
}

// Register the Voice Channel for the app
tac.registerChannel(voice);

// Start the TAC server that has proper webhook handling and WebSocket support
const server = new TACServer(tac);
await server.start();

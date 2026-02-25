c = open("/home/ubuntu/vutler/app/custom/services/llmRouter.js").read()

# Add error logging for the primary provider
old = "    } catch (error) {\n      // Don't retry quota errors"
new = "    } catch (error) {\n      console.error(`LLM Router primary ${initialProvider} error:`, error.message);\n      // Don't retry quota errors"

if old in c:
    c = c.replace(old, new)
    print("Added primary error logging")

# Also disable the fallback chain for now - it makes no sense to send anthropic key to openai
old2 = "const fallbackChain = FALLBACK_CHAINS[initialProvider] || [];"
new2 = "const fallbackChain = []; // FALLBACK_CHAINS[initialProvider] || [];"
if old2 in c:
    c = c.replace(old2, new2)
    print("Disabled fallback chain")

open("/home/ubuntu/vutler/app/custom/services/llmRouter.js", "w").write(c)

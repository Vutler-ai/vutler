'use strict';

/**
 * @typedef {import('./LLMPromptHandler').SkillContext} SkillContext
 * @typedef {import('./LLMPromptHandler').SkillResult}  SkillResult
 */

/**
 * @typedef {Object} CompositeStep
 * @property {string} skill       - Skill key to execute for this step
 * @property {string} input_from  - 'context' (original params) | 'previous' (last step result)
 * @property {string} [label]     - Optional human-readable step name for logs
 */

/**
 * Handler for multi-step composite skills.
 *
 * Executes a sequential pipeline of sub-skills defined in config.steps.
 * Each step can receive:
 *   - `input_from: 'context'`  → the original context.params
 *   - `input_from: 'previous'` → the data from the previous step's result
 *
 * Pipeline stops on first failure unless config.continue_on_error = true.
 * The final result aggregates all step results.
 */
class CompositeHandler {
  /**
   * @param {Function} getRegistry - Lazy getter to avoid circular dependency.
   *                                 Returns the SkillRegistry singleton.
   */
  constructor(getRegistry) {
    if (typeof getRegistry !== 'function') {
      throw new TypeError('CompositeHandler requires a getRegistry function to avoid circular dependency');
    }
    this._getRegistry = getRegistry;
  }

  /**
   * Composite skills are always executable — individual steps handle their own
   * availability checks.
   * @param {SkillContext} _context
   * @returns {Promise<boolean>}
   */
  async canExecute(_context) {
    return true;
  }

  /**
   * Run the pipeline of sub-skills.
   * @param {SkillContext} context
   * @returns {Promise<SkillResult>}
   */
  async execute(context) {
    const { skillKey, config } = context;
    const steps = config?.steps;

    if (!Array.isArray(steps) || steps.length === 0) {
      return {
        success: false,
        error:   `CompositeHandler: no steps defined for skill "${skillKey}"`,
      };
    }

    const registry       = this._getRegistry();
    const continueOnErr  = config.continue_on_error === true;

    /** @type {SkillResult[]} */
    const results       = [];
    let   previousResult = null;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (!step.skill) {
        const err = `CompositeHandler: step ${i} in "${skillKey}" is missing the "skill" property`;
        if (!continueOnErr) {
          return { success: false, error: err, data: results };
        }
        results.push({ success: false, error: err });
        continue;
      }

      // Resolve params for this step
      const stepParams = step.input_from === 'previous' && previousResult?.data != null
        ? previousResult.data
        : context.params;

      /** @type {SkillContext} */
      const stepContext = {
        ...context,
        skillKey: step.skill,
        params:   stepParams,
      };

      console.log(
        `[CompositeHandler] "${skillKey}" step ${i + 1}/${steps.length}: executing "${step.skill}"` +
        (step.label ? ` (${step.label})` : '')
      );

      let stepResult;
      try {
        stepResult = await registry.execute(step.skill, stepContext);
      } catch (err) {
        stepResult = { success: false, error: `Unexpected error in step "${step.skill}": ${err.message}` };
      }

      results.push(stepResult);

      if (!stepResult.success) {
        console.warn(
          `[CompositeHandler] "${skillKey}" step "${step.skill}" failed: ${stepResult.error}`
        );
        if (!continueOnErr) {
          return {
            success: false,
            error:   `Composite pipeline failed at step "${step.skill}": ${stepResult.error}`,
            data:    results,
            meta: {
              handler:       'composite',
              skillKey,
              steps_run:     i + 1,
              steps_total:   steps.length,
              failed_step:   step.skill,
            },
          };
        }
      }

      previousResult = stepResult;
    }

    const allSucceeded = results.every(r => r.success);

    return {
      success: allSucceeded,
      data:    results,
      meta: {
        handler:     'composite',
        skillKey,
        steps_run:   results.length,
        steps_total: steps.length,
      },
    };
  }
}

module.exports = { CompositeHandler };

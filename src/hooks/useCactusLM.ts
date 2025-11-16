import { useCallback, useEffect, useState } from 'react';
import { CactusLM } from '../classes/CactusLM';
import type {
  CactusCompletionParams,
  CactusCompletionResult,
  CactusDownloadParams,
  CactusEmbeddingParams,
  CactusEmbeddingResult,
  CactusGetModelsParams,
  CactusInitParams,
  CactusModel,
} from '../types/CactusLM';
import { getErrorMessage } from '../utils/error';

export const useCactusLM = () => {
  const [cactusLM] = useState(() => new CactusLM());

  // State
  const [completion, setCompletion] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      (async () => {
        await cactusLM.stop();
        await cactusLM.destroy();
      })();
    };
  }, [cactusLM]);

  const download = useCallback(
    async ({ model, onProgress }: CactusDownloadParams = {}) => {
      setError(null);

      try {
        await cactusLM.download({
          model,
          onProgress: (progress) => {
            setDownloadProgress(progress);
            onProgress?.(progress);
          },
        });
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      }
    },
    [cactusLM]
  );

  const init = useCallback(
    async ({ model, contextSize }: CactusInitParams = {}) => {
      setError(null);

      setIsInitialized(false);
      try {
        await cactusLM.init({ model, contextSize });
        setIsInitialized(true);
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      }
    },
    [cactusLM]
  );

  const complete = useCallback(
    async ({
      messages,
      options,
      tools,
      onToken,
      model,
      contextSize,
    }: CactusCompletionParams): Promise<CactusCompletionResult> => {
      if (isGenerating) {
        const message = 'CactusLM is already generating';
        setError(message);
        throw new Error(message);
      }

      setError(null);

      if (!isInitialized || model !== undefined || contextSize !== undefined) {
        await init({ model, contextSize });
      }

      setCompletion('');
      setIsGenerating(true);
      try {
        return await cactusLM.complete({
          messages,
          options,
          tools,
          onToken: (token) => {
            setCompletion((prev) => prev + token);
            onToken?.(token);
          },
          model,
          contextSize,
        });
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      } finally {
        setIsGenerating(false);
      }
    },
    [cactusLM, init, isGenerating, isInitialized]
  );

  const embed = useCallback(
    async ({
      text,
      model,
    }: CactusEmbeddingParams): Promise<CactusEmbeddingResult> => {
      if (isGenerating) {
        const message = 'CactusLM is already generating';
        setError(message);
        throw new Error(message);
      }

      setError(null);

      if (!isInitialized || model !== undefined) {
        await init({ model });
      }

      setIsGenerating(true);
      try {
        return await cactusLM.embed({ text, model });
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      } finally {
        setIsGenerating(false);
      }
    },
    [cactusLM, init, isGenerating, isInitialized]
  );

  const stop = useCallback(async () => {
    setError(null);

    try {
      await cactusLM.stop();
      setIsGenerating(false);
    } catch (e) {
      setError(getErrorMessage(e));
      throw e;
    }
  }, [cactusLM]);

  const reset = useCallback(async () => {
    setError(null);

    await stop();

    try {
      await cactusLM.reset();
    } catch (e) {
      setError(getErrorMessage(e));
      throw e;
    }
  }, [cactusLM, stop]);

  const destroy = useCallback(async () => {
    setError(null);

    await stop();

    try {
      await cactusLM.destroy();
      setIsInitialized(false);
    } catch (e) {
      setError(getErrorMessage(e));
      throw e;
    }
  }, [cactusLM, stop]);

  const getModels = useCallback(
    async ({ forceRefresh }: CactusGetModelsParams = {}): Promise<
      CactusModel[]
    > => {
      setError(null);

      try {
        return await cactusLM.getModels({ forceRefresh });
      } catch (e) {
        setError(getErrorMessage(e));
        throw e;
      }
    },
    [cactusLM]
  );

  return {
    completion,
    isGenerating,
    isInitialized,
    downloadProgress,
    error,
    download,
    init,
    complete,
    embed,
    reset,
    stop,
    destroy,
    getModels,
  };
};

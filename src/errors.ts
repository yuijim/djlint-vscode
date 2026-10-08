import * as vscode from "vscode";
import { formattingArgs, lintingArgs, type CliArg } from "./args.js";
import type { CustomExecaError } from "./runner.js";

const argsMap: ReadonlyMap<string, CliArg> = new Map(
  [...formattingArgs, ...lintingArgs].map((arg) => [arg.cliName, arg]),
);

const installDocsUrl = "https://djlint.com/docs/getting-started/";
const readmeUrl = "https://github.com/djlint/djLint/blob/master/README.md";
const extReadmeUrl =
  "https://github.com/djlint/djLint-vscode/blob/main/README.md";

function errorToOutputChannel(
  outputChannel: vscode.LogOutputChannel,
  e: Error,
): void {
  outputChannel.error(JSON.stringify(e, null, "\t"));
}

function showError(
  e: Error,
  outputChannel: vscode.LogOutputChannel,
  userMessage?: string,
): void {
  errorToOutputChannel(outputChannel, e);
  void (async (): Promise<void> => {
    const item = await vscode.window.showErrorMessage(
      userMessage ?? e.message,
      "Details",
    );
    if (item != null) {
      outputChannel.show();
    }
  })();
}

export function checkErrors(
  e: CustomExecaError,
  outputChannel: vscode.LogOutputChannel,
  config: vscode.WorkspaceConfiguration,
): CustomExecaError {
  if (e.exitCode != null) {
    if (/(?:^$|Linting\s+\d+\/\d+\s+files)/u.test(e.stderr)) {
      return e;
    }

    if (/No\s+module\s+named\s+djlint/u.test(e.stderr)) {
      errorToOutputChannel(outputChannel, e);

      const configName = "showInstallError";
      if (config.get<boolean>(configName)) {
        const errMsg = `djLint is not installed or cannot be executed with the current extension settings. See installation instructions at ${extReadmeUrl}.`;
        void (async (): Promise<void> => {
          const choice = await vscode.window.showErrorMessage(
            errMsg,
            "Do not show again (workspace)",
            "Do not show again (global)",
            "Details",
          );
          // eslint-disable-next-line default-case, @typescript-eslint/switch-exhaustiveness-check
          switch (choice) {
            case "Do not show again (workspace)": {
              void config.update(
                configName,
                false,
                vscode.ConfigurationTarget.Workspace,
              );
              break;
            }
            case "Do not show again (global)": {
              void config.update(
                configName,
                false,
                vscode.ConfigurationTarget.Global,
              );
              break;
            }
            case "Details": {
              outputChannel.show();
              break;
            }
          }
        })();
      }
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw e;
    }

    const option = /No\s+such\s+option:\s*(?<option>\S+)/u.exec(e.stderr)
      ?.groups?.["option"];
    if (option) {
      const arg = argsMap.get(option);
      if (arg) {
        const optionName = arg.vscodeName
          ? `djlint.${arg.vscodeName}`
          : arg.cliName;
        const errMsg = `Your version of djLint does not support the \`${optionName}\` option. Disable it in the settings or update djLint to version ${arg.minVersion} or newer. See update instructions at ${installDocsUrl} or ${readmeUrl}.`;
        showError(e, outputChannel, errMsg);
      } else {
        showError(e, outputChannel);
      }
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw e;
    }

    /*
     * A non-empty stdout on exit code 1 means djLint did its job: it exits with
     * 1 both when the linter finds problems and when the formatter would change
     * the file. Whatever is on stderr is only noise then (e.g. DeprecationWarnings
     * from djLint's dependencies), so log it instead of showing an error message.
     */
    if (e.exitCode === 1 && e.stdout) {
      outputChannel.warn(
        `djLint exited with code 1 and wrote to stderr, using its stdout anyway:\n${e.stderr}`,
      );
      return e;
    }
  }

  if (!e.isCanceled) {
    showError(e, outputChannel);
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  throw e;
}

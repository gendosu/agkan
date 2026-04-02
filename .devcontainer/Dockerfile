FROM node:24-bookworm

# Install basic tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    sudo \
    jq \
    ripgrep \
    tmux \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Allow node user to use sudo without password
RUN echo 'node ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node

# Create node user home directory
RUN mkdir -p /home/node && chown -R node:node /home/node

# Install pnpm
RUN npm install -g pnpm

# Configure pnpm global bin directory
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

# Install TypeScript and TypeScript Language Server globally
RUN pnpm add -g typescript-language-server typescript

# Switch to node user
USER node
WORKDIR /workspace

# Configure pnpm global bin directory for node user
ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="/home/node/.local/share/pnpm:${PATH}"

RUN echo 'alias claude-skip="claude --dangerously-skip-permissions"' >> ~/.bash_aliases

# Install Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude Code to PATH
ENV PATH="/home/node/.local/bin:${PATH}"

CMD ["sleep", "infinity"]

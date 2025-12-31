# Contributing to Nexus Wars

Thank you for your interest in contributing to Nexus Wars! This document provides guidelines and instructions for contributing.

## 🎯 Areas for Contribution

### High Priority
- [ ] Mobile touch controls optimization
- [ ] Additional game modes (Team Battle, King of the Hill)
- [ ] Leaderboard persistence (database integration)
- [ ] Spectator mode
- [ ] Replay system

### Game Balance
- [ ] Power-up balancing
- [ ] Ability cooldown tuning
- [ ] Scoring system refinement
- [ ] Game phase timing adjustments

### Visual Enhancements
- [ ] Particle effects improvements
- [ ] Screen shake on impacts
- [ ] More visual feedback for actions
- [ ] Custom player skins/colors
- [ ] Map themes

### Technical Improvements
- [ ] Redis integration for session management
- [ ] Player authentication system
- [ ] Anti-cheat measures
- [ ] Performance optimizations
- [ ] Test coverage

## 🛠 Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/nexus-wars.git
   cd nexus-wars
   ```

2. **Install Dependencies**
   ```bash
   npm install
   cd client && npm install
   cd ../server && npm install
   ```

3. **Start Development Servers**
   ```bash
   npm run dev
   ```

4. **Run Tests** (when available)
   ```bash
   npm test
   ```

## 📝 Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add comments for complex logic
- Use meaningful variable and function names

## 🔄 Pull Request Process

1. Create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
   - Write clean, documented code
   - Test your changes thoroughly
   - Update documentation if needed

3. Commit your changes
   ```bash
   git commit -m "feat: add amazing feature"
   ```
   
   Use conventional commit messages:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `style:` - Code style changes
   - `refactor:` - Code refactoring
   - `perf:` - Performance improvements
   - `test:` - Test additions or changes

4. Push to your fork
   ```bash
   git push origin feature/your-feature-name
   ```

5. Open a Pull Request
   - Describe your changes clearly
   - Reference any related issues
   - Include screenshots for visual changes

## 🐛 Bug Reports

When reporting bugs, please include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS information
- Screenshots or recordings if applicable

## 💡 Feature Requests

For feature requests:
- Describe the feature clearly
- Explain the use case
- Consider implementation complexity
- Discuss potential trade-offs

## 🎮 Game Design Principles

When contributing game features:

1. **Fast-Paced**: Keep rounds under 2 minutes
2. **Skill-Based**: Reward player skill and strategy
3. **Balanced**: No single strategy should dominate
4. **Clear Feedback**: Players should understand what's happening
5. **Accessible**: Easy to learn, hard to master

## 🧪 Testing Guidelines

Before submitting:
- [ ] Test with 2-10 players
- [ ] Check mobile responsiveness
- [ ] Verify WebSocket connections
- [ ] Test edge cases (disconnections, rejoining)
- [ ] Ensure no console errors

## 📚 Documentation

Update documentation when:
- Adding new features
- Changing game mechanics
- Modifying deployment process
- Adding dependencies

## 🤝 Code Review

All contributions go through code review:
- Be open to feedback
- Respond to comments promptly
- Make requested changes
- Ask questions if unclear

## 🎨 Asset Contributions

For visual/audio assets:
- Use appropriate licenses
- Optimize file sizes
- Follow existing style
- Include attribution

## 🌐 Internationalization

When adding text:
- Use clear, concise language
- Consider non-English speakers
- Prepare for future i18n support

## 📊 Performance

Keep performance in mind:
- Minimize network calls
- Optimize rendering
- Reduce bundle size
- Profile before optimizing

## 🔒 Security

- Never commit sensitive data
- Validate all user input
- Use environment variables for configs
- Report security issues privately

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 💬 Communication

- GitHub Issues: Bug reports and features
- GitHub Discussions: General questions
- Pull Requests: Code contributions

## 🎉 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Credited in release notes
- Mentioned in documentation

Thank you for contributing to Nexus Wars! 🚀

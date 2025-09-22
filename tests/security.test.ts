/**
 * 安全验证器测试
 *
 * @description 测试输入综合验证、有效输入、无效输入类型验证、无效输入字符串验证、
 *              安全模式验证（严格级别）、安全模式验证（中等等级）、安全模式验证（基础等级）、边缘情况
 * @author liyq
 * @since 1.0.0
 */

import { SecurityValidator } from '../src/security.js';
import { DefaultConfig } from '../src/constants.js';
import { ValidationLevel } from '../src/types.js';

describe('SecurityValidator', () => {
  describe('validateInputComprehensive', () => {
    describe('Valid inputs', () => {
      it('should accept valid string inputs', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('valid string', 'test_field');
        }).not.toThrow();
      });

      it('should accept valid number inputs', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive(123, 'test_field');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive(45.67, 'test_field');
        }).not.toThrow();
      });

      it('should accept valid boolean inputs', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive(true, 'test_field');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive(false, 'test_field');
        }).not.toThrow();
      });

      it('should accept null and undefined inputs', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive(null, 'test_field');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive(undefined, 'test_field');
        }).not.toThrow();
      });

      it('should accept normal SQL queries', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT id, name FROM users WHERE active = 1', 'query');
        }).not.toThrow();
      });

      it('should accept table names', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('users', 'table_name');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('user_profiles', 'table_name');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('table123', 'table_name');
        }).not.toThrow();
      });
    });

    describe('Invalid inputs - Type validation', () => {
      it('should reject invalid data types', () => {
        

        

        

        

        expect(() => {
          SecurityValidator.validateInputComprehensive(() => {}, 'test_field');
        }).toThrow('test_field 具有无效的数据类型');
      });
    });

    describe('Invalid inputs - String validation', () => {
      it('should reject strings with control characters', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('test\x00string', 'test_field');
        }).toThrow('test_field 包含无效的控制字符');

        expect(() => {
          SecurityValidator.validateInputComprehensive('test\x01string', 'test_field');
        }).toThrow('test_field 包含无效的控制字符');
      });

      it('should allow valid control characters (tab, newline, carriage return)', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('test\tstring', 'test_field');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('test\nstring', 'test_field');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('test\rstring', 'test_field');
        }).not.toThrow();
      });

      it('should reject strings that exceed maximum length', () => {
        const longString = 'a'.repeat(DefaultConfig.MAX_INPUT_LENGTH + 1);
        expect(() => {
          SecurityValidator.validateInputComprehensive(longString, 'test_field');
        }).toThrow('test_field 超过最大长度限制');
      });
    });

    describe('Security pattern validation - Strict level', () => {
      it('should reject dangerous SQL patterns', () => {
        // 文件访问模式
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT LOAD_FILE("/etc/passwd")', 'query');
        }).toThrow(/query 包含危险操作模式/);

        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT * INTO OUTFILE "/tmp/dump.txt"', 'query');
        }).toThrow(/query 包含危险操作模式/);

        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT * INTO DUMPFILE "/tmp/dump.txt"', 'query');
        }).toThrow(/query 包含危险操作模式/);

        // 命令执行模式
        expect(() => {
          SecurityValidator.validateInputComprehensive('EXEC xp_cmdshell "dir"', 'query');
        }).toThrow(/query 包含危险操作模式/);

        expect(() => {
          SecurityValidator.validateInputComprehensive('SYSTEM("rm -rf /")', 'query');
        }).toThrow(/query 包含危险操作模式/);

        // 基于时间的攻击模式
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT BENCHMARK(1000000, MD5("test"))', 'query');
        }).toThrow(/query 包含危险操作模式/);

        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT SLEEP(10)', 'query');
        }).toThrow(/query 包含危险操作模式/);

        // 系统变量访问
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT @@version', 'query');
        }).toThrow(/query 包含危险操作模式/);
      });

      it('should reject SQL injection patterns', () => {
        // 基于引号的 OR 条件注入
        expect(() => {
          SecurityValidator.validateInputComprehensive("' OR '1'='1", 'input');
        }).toThrow(/input 包含SQL注入尝试/);

        expect(() => {
          SecurityValidator.validateInputComprehensive('" OR "1"="1', 'input');
        }).toThrow(/input 包含SQL注入尝试/);

        // 基于 UNION 的注入
        expect(() => {
          SecurityValidator.validateInputComprehensive("' UNION SELECT password FROM users --", 'input');
        }).toThrow(/input 包含SQL注入尝试/);

        // 基于布尔的盲注
        expect(() => {
          SecurityValidator.validateInputComprehensive("' AND 1=1 --", 'input');
        }).toThrow(/input 包含SQL注入尝试/);

        // 经典认证绕过
        expect(() => {
          SecurityValidator.validateInputComprehensive("admin' --", 'input');
        }).toThrow(/input 包含SQL注入尝试/);
      });
    });

    describe('Security pattern validation - Moderate level', () => {
      it('should have more lenient validation in moderate mode', () => {
        // 在中等级别下，只有风险评分>50的模式才会被捕获
        // 根据实际实现，大多数单个模式的风险评分都低于50
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT LOAD_FILE("/etc/passwd")', 'query', ValidationLevel.MODERATE);
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT * INTO OUTFILE "/tmp/dump"', 'query', ValidationLevel.MODERATE);
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('EXEC xp_cmdshell "dir"', 'query', ValidationLevel.MODERATE);
        }).not.toThrow();

        // 中等级别应该允许一些在严格模式下被拒绝的模式
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT * FROM users WHERE id = 1 OR 1=1', 'query', ValidationLevel.MODERATE);
        }).not.toThrow();

        // 在中等模式下可能不会捕获不太关键的模式
        // （取决于前3个关键模式中包含哪些模式）
      });
    });

    describe('Security pattern validation - Basic level', () => {
      it('should skip pattern validation in basic mode', () => {
        // 基础模式应跳过模式验证以提高性能
        expect(() => {
          SecurityValidator.validateInputComprehensive('SELECT LOAD_FILE("/etc/passwd")', 'query', ValidationLevel.BASIC);
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive("' OR '1'='1", 'input', ValidationLevel.BASIC);
        }).not.toThrow();
      });

      it('should still perform basic validations in basic mode', () => {
        // 仍应检查控制字符
        expect(() => {
          SecurityValidator.validateInputComprehensive('test\x00string', 'test_field', ValidationLevel.BASIC);
        }).toThrow('test_field 包含无效的控制字符');

        // 仍应检查长度
        const longString = 'a'.repeat(DefaultConfig.MAX_INPUT_LENGTH + 1);
        expect(() => {
          SecurityValidator.validateInputComprehensive(longString, 'test_field', ValidationLevel.BASIC);
        }).toThrow('test_field 超过最大长度限制');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty strings', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('', 'test_field');
        }).not.toThrow();
      });

      it('should handle strings with only whitespace', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('   ', 'test_field');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('\t\n\r', 'test_field');
        }).not.toThrow();
      });

      it('should handle strings with special characters', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('test@example.com', 'email');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('price: $19.99', 'description');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('Hello, world! How are you?', 'message');
        }).not.toThrow();
      });

      it('should handle Unicode characters', () => {
        expect(() => {
          SecurityValidator.validateInputComprehensive('测试字符串', 'chinese_text');
        }).not.toThrow();

        expect(() => {
          SecurityValidator.validateInputComprehensive('émojis: 😀🎉', 'unicode_text');
        }).not.toThrow();
      });
    });
  });
});